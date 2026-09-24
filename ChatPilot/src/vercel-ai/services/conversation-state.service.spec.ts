import { ConversationStateService } from './conversation-state.service'

describe('ConversationStateService', () => {
  const prisma = {
    properties: { findMany: jest.fn() },
    contacts: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  } as any
  const service = new ConversationStateService(prisma)

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
      conversation_state: null,
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
          updatedAt: '2026-09-24T12:00:00.000Z',
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
})
