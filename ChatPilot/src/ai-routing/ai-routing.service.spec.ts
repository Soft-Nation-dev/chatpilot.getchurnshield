import { AiRoutingService } from './ai-routing.service'

describe('AiRoutingService tool recovery', () => {
  const service = new AiRoutingService({} as any, {} as any)

  it('returns a polished confirmation when media was sent before provider text failed', () => {
    const reply = (service as any).customerReplyFromToolResults([
      {
        name: 'send_property_media',
        result:
          'Sent 2 verified images for Demo Duplex. The customer has received the media.',
      },
    ])

    expect(reply).toMatch(/sent the property pictures/i)
    expect(reply).not.toMatch(/https?:|json|tool/i)
  })

  it('does not turn a failed inventory-search turn into a generic reply', () => {
    const reply = (service as any).customerReplyFromToolResults([
      {
        name: 'search_inventory',
        result: JSON.stringify({
          count: 1,
          matches: [
            {
              title: 'Demo Duplex',
              propertyType: 'Duplex',
              bedrooms: 4,
              location: 'Lekki Phase 1',
              state: 'Lagos',
              price: '200000000',
              currency: 'NGN',
            },
          ],
        }),
      },
    ])

    expect(reply).toBeNull()
  })

  it('allows only media delivery after a read-only search during provider failover', () => {
    const sendPropertyMedia = { execute: jest.fn() }
    const retryTools = (service as any).toolsForProviderRetry(
      {
        search_inventory: { execute: jest.fn() },
        send_property_media: sendPropertyMedia,
        book_appointment: { execute: jest.fn() },
      },
      [{ name: 'search_inventory', result: '{"matches":[]}' }],
    )

    expect(Object.keys(retryTools)).toEqual(['send_property_media'])
  })
})
