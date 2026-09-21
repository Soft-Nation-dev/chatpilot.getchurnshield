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
})
