import { ConversationStateService } from './conversation-state.service'

describe('ConversationStateService', () => {
  const prisma = {
    properties: { findMany: jest.fn(), findFirst: jest.fn() },
    contacts: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    messages: { findFirst: jest.fn() },
  } as any
  const chatLifecycle = { transition: jest.fn() } as any
  const service = new ConversationStateService(prisma, chatLifecycle)

  beforeEach(() => jest.clearAllMocks())

  it('retains the sole selected property and asks only for time after a day is chosen', async () => {
    prisma.properties.findMany.mockResolvedValue([
      { id: 7, title: 'Demo 4-Bedroom Fully Detached Duplex' },
    ])
    prisma.contacts.update.mockResolvedValue({})
    const contact = {
      id: 22,
      name: 'Emmanuel',
      crm_appointment_id: null,
      conversation_state: {
        version: 1,
        inspection: {
          status: 'collecting_day',
          propertyId: 7,
          propertyTitle: 'Demo 4-Bedroom Fully Detached Duplex',
          updatedAt: new Date().toISOString(),
        },
      },
      companies: { id: 3 },
    } as any

    const result = await service.prepareTurn(contact, 'Saturday is okay', [
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Would Friday or Saturday work for the inspection?',
          },
        ],
      },
    ] as any)

    expect(result.state?.inspection).toMatchObject({
      propertyId: 7,
      propertyTitle: 'Demo 4-Bedroom Fully Detached Duplex',
      requestedDay: 'Saturday',
      status: 'collecting_time',
    })
    expect(result.deterministicReply).toBe(
      'Saturday is noted for Demo 4-Bedroom Fully Detached Duplex. What time on Saturday works best for you?',
    )
  })

  it('does not let a pending inspection hijack a question about other properties', async () => {
    prisma.properties.findMany.mockResolvedValue([
      { id: 7, title: 'Demo 4-Bedroom Fully Detached Duplex' },
      { id: 8, title: 'Three Bedroom Terrace in Ajah' },
    ])
    const contact = {
      id: 22,
      name: 'Emmanuel',
      crm_appointment_id: null,
      conversation_state: {
        version: 1,
        inspection: {
          status: 'collecting_day',
          propertyId: 7,
          propertyTitle: 'Demo 4-Bedroom Fully Detached Duplex',
          updatedAt: new Date().toISOString(),
        },
      },
      companies: { id: 3 },
    } as any

    const result = await service.prepareTurn(
      contact,
      'Is that the only property available? It has been a while since we discussed.',
      [],
    )

    expect(result.deterministicReply).toBeNull()
    expect(result.state?.inspection).toMatchObject({
      status: 'collecting_day',
      propertyId: 7,
    })
    expect(result.systemContext).toMatch(/answer the latest question first/i)
    expect(prisma.contacts.update).not.toHaveBeenCalled()
  })

  it('does not repeat the pending day question when the customer points out it was ignored', async () => {
    prisma.properties.findMany.mockResolvedValue([
      { id: 7, title: 'Demo 4-Bedroom Fully Detached Duplex' },
    ])
    const contact = {
      id: 22,
      name: 'Emmanuel',
      crm_appointment_id: null,
      conversation_state: {
        version: 1,
        inspection: {
          status: 'collecting_day',
          propertyId: 7,
          propertyTitle: 'Demo 4-Bedroom Fully Detached Duplex',
          updatedAt: new Date().toISOString(),
        },
      },
      companies: { id: 3 },
    } as any

    const result = await service.prepareTurn(
      contact,
      'I just asked you a question',
      [],
    )

    expect(result.deterministicReply).toBeNull()
    expect(prisma.contacts.update).not.toHaveBeenCalled()
  })

  it('expires an abandoned pending inspection instead of reviving it days later', async () => {
    prisma.contacts.update.mockResolvedValue({})
    const contact = {
      id: 22,
      name: 'Emmanuel',
      crm_appointment_id: null,
      conversation_state: {
        version: 1,
        inspection: {
          status: 'collecting_day',
          propertyId: 7,
          propertyTitle: 'Demo 4-Bedroom Fully Detached Duplex',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      companies: { id: 3 },
    } as any

    const result = await service.prepareTurn(
      contact,
      'How are you doing? I want to buy a property.',
      [],
    )

    expect(result.deterministicReply).toBeNull()
    expect(result.state).toEqual({ version: 1 })
    expect(prisma.contacts.update).toHaveBeenCalledWith({
      where: { id: 22 },
      data: { conversation_state: { version: 1 } },
    })
  })

  it('does not restart questions while the team is confirming a failed calendar request', async () => {
    prisma.properties.findMany.mockResolvedValue([
      { id: 7, title: 'Demo 4-Bedroom Fully Detached Duplex' },
    ])
    prisma.contacts.update.mockResolvedValue({})
    const contact = {
      id: 22,
      name: 'Emmanuel',
      crm_appointment_id: null,
      conversation_state: {
        version: 1,
        inspection: {
          status: 'awaiting_human',
          propertyId: 7,
          propertyTitle: 'Demo 4-Bedroom Fully Detached Duplex',
          requestedDay: 'Saturday',
          requestedDate: '2026-09-26',
          requestedTime: '10:00 AM',
          updatedAt: new Date().toISOString(),
        },
      },
      companies: { id: 3 },
    } as any

    const result = await service.prepareTurn(
      contact,
      'I thought we already agreed on Saturday?',
      [],
    )

    expect(result.deterministicReply).toMatch(/team is confirming/i)
    expect(result.deterministicReply).not.toMatch(
      /what day|which property|what time/i,
    )
  })

  it('clears awaiting_human automatically when a chat was manually reopened', async () => {
    prisma.contacts.update.mockResolvedValue({})
    const contact = {
      id: 22,
      name: 'Emmanuel',
      crm_appointment_id: null,
      chat_state: 'QUALIFYING',
      is_replies_activated: true,
      conversation_state: {
        version: 1,
        inspection: {
          status: 'awaiting_human',
          propertyId: 7,
          propertyTitle: 'Demo 4-Bedroom Fully Detached Duplex',
          requestedDay: 'Saturday',
          updatedAt: new Date().toISOString(),
        },
      },
      companies: { id: 3 },
    } as any

    const result = await service.prepareTurn(
      contact,
      'Do you have any other properties?',
      [],
    )

    expect(result).toMatchObject({
      state: { version: 1 },
      systemContext: '',
      deterministicReply: null,
    })
    expect(prisma.contacts.update).toHaveBeenCalledWith({
      where: { id: 22 },
      data: { conversation_state: { version: 1 } },
    })
  })

  it('recalls the active property and rotates to unsent pictures without an AI call', async () => {
    const state = {
      version: 1,
      memory: {
        activePropertyId: 7,
        activePropertyTitle: 'Demo Duplex',
        sentMedia: [
          {
            propertyId: 7,
            url: 'https://cdn.test/one.jpg',
            sentAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    }
    prisma.properties.findFirst.mockResolvedValue({
      id: 7,
      title: 'Demo Duplex',
      location: 'Lekki Phase 1',
      image_urls:
        'https://cdn.test/one.jpg,https://cdn.test/two.jpg,https://cdn.test/three.jpg',
    })
    prisma.contacts.findUnique.mockResolvedValue({ conversation_state: state })
    prisma.contacts.update.mockResolvedValue({})
    const contact = {
      id: 22,
      chat_state: 'QUALIFYING',
      is_replies_activated: true,
      conversation_state: state,
      companies: { id: 3 },
    } as any

    const result = await service.prepareTurn(
      contact,
      'Good morning, please send the pictures of the property again.',
      [],
    )

    expect(result.deterministicReply).toContain('https://cdn.test/two.jpg')
    expect(result.deterministicReply).toContain('https://cdn.test/three.jpg')
    expect(result.deterministicReply).not.toContain('https://cdn.test/one.jpg')
    expect(prisma.properties.findMany).not.toHaveBeenCalled()
  })

  it.each([
    'The pic pls',
    'I need the pictures or media',
    'I would love to see the property media',
  ])('recognizes natural property-media shorthand: %s', async message => {
    const state = {
      version: 1,
      memory: {
        activePropertyId: 7,
        activePropertyTitle: 'Demo Duplex',
        sentMedia: [],
        updatedAt: new Date().toISOString(),
      },
    }
    prisma.properties.findFirst.mockResolvedValue({
      id: 7,
      title: 'Demo Duplex',
      location: 'Lekki Phase 1',
      image_urls: 'https://cdn.test/one.jpg,https://cdn.test/two.jpg',
    })
    prisma.contacts.findUnique.mockResolvedValue({ conversation_state: state })
    prisma.contacts.update.mockResolvedValue({})

    const result = await service.prepareTurn(
      {
        id: 22,
        chat_state: 'QUALIFYING',
        is_replies_activated: true,
        conversation_state: state,
        companies: { id: 3 },
      } as any,
      message,
      [],
    )

    expect(result.deterministicReply).toContain('https://cdn.test/one.jpg')
    expect(prisma.properties.findMany).not.toHaveBeenCalled()
  })

  it('backfills active-property memory from the last image sent before this upgrade', async () => {
    prisma.messages.findFirst.mockResolvedValue({
      image_url: 'https://cdn.test/legacy.jpg',
    })
    prisma.properties.findFirst.mockResolvedValue({
      id: 8,
      title: 'Legacy Lekki Duplex',
      location: 'Lekki',
      image_urls: 'https://cdn.test/legacy.jpg,https://cdn.test/fresh.jpg',
    })
    prisma.contacts.findUnique.mockResolvedValue({
      conversation_state: { version: 1 },
    })
    prisma.contacts.update.mockResolvedValue({})
    const contact = {
      id: 23,
      chat_state: 'QUALIFYING',
      is_replies_activated: true,
      conversation_state: { version: 1 },
      companies: { id: 3 },
    } as any

    const result = await service.prepareTurn(
      contact,
      'Please send the picture of the property again.',
      [],
    )

    expect(result.deterministicReply).toContain('https://cdn.test/fresh.jpg')
    expect(prisma.contacts.update).toHaveBeenCalled()
  })
})
