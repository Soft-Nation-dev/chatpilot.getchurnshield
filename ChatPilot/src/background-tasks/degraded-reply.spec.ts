import { buildDegradedReply } from './degraded-reply'

describe('buildDegradedReply', () => {
  const contact = {
    name: 'Chidozie Okoro',
    property_type: null,
    preferred_location: null,
  } as any

  it('acknowledges a Nigerian budget and asks for useful next facts', () => {
    expect(buildDegradedReply(contact, '20 million')).toBe(
      'Thanks, Chidozie. I’ve noted your ₦20,000,000 budget. What property type and location are you considering?',
    )
  })

  it('does not expose provider availability in the customer reply', () => {
    const reply = buildDegradedReply(contact, 'Yes pls share')
    expect(reply).not.toMatch(/assistant|provider|unavailable|error/i)
    expect(reply).toMatch(/property name|location/i)
  })

  it('uses persisted inspection facts instead of asking the day again', () => {
    const reply = buildDegradedReply(
      {
        ...contact,
        conversation_state: {
          version: 1,
          inspection: {
            status: 'collecting_time',
            propertyTitle: 'Demo 4-Bedroom Fully Detached Duplex',
            requestedDay: 'Saturday',
          },
        },
      } as any,
      'I thought we agreed on Saturday?',
    )
    expect(reply).toBe(
      'Saturday is noted for Demo 4-Bedroom Fully Detached Duplex. What time on Saturday works best for you?',
    )
  })

  it('closes naturally while a calendar request awaits human confirmation', () => {
    const reply = buildDegradedReply(
      {
        ...contact,
        conversation_state: {
          version: 1,
          inspection: {
            status: 'awaiting_human',
            requestedDay: 'Saturday',
          },
        },
      } as any,
      'Okay',
    )
    expect(reply).toMatch(/team is confirming/i)
    expect(reply).not.toMatch(/what day|what time|which property/i)
  })

  it('resends remembered property media when providers are unavailable', () => {
    const reply = buildDegradedReply(
      {
        ...contact,
        conversation_state: {
          version: 1,
          memory: {
            activePropertyId: 42,
            activePropertyTitle: 'Demo Duplex',
            sentMedia: [
              {
                propertyId: 42,
                url: 'https://cdn.test/demo.jpg',
                sentAt: new Date().toISOString(),
              },
            ],
            updatedAt: new Date().toISOString(),
          },
        },
      } as any,
      'Please send the picture again',
    )

    expect(reply).toBe('![Demo Duplex](https://cdn.test/demo.jpg)')
  })
})
