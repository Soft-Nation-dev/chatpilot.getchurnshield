import { BuyerFinderClassifierService } from './buyer-finder-classifier.service'

const comment = (text: string) => ({
  id: 11,
  platform: 'instagram',
  external_id: 'instagram-comment-11',
  comment_text: text,
  author_bio: null,
  author_profile_url: 'https://instagram.com/buyer',
  phone_normalized: null,
  status: 'pending',
  post: {
    property_type: '4-bedroom duplex',
    specific_location: 'Lekki, Lagos',
    caption: '4-bedroom duplex in Lekki, Lagos',
    account: { states: ['Lagos'] },
  },
})

describe('BuyerFinderClassifierService', () => {
  function serviceFor(value: any, generate = jest.fn()) {
    const candidate = {
      id: 22,
      is_high_intent: false,
      intent_score: 1,
    }
    const tx = {
      buyer_finder_candidates: {
        upsert: jest.fn(async ({ create }) => ({ ...candidate, ...create })),
      },
      buyer_finder_comments: { update: jest.fn() },
    }
    const prisma = {
      buyer_finder_comments: { findUnique: jest.fn().mockResolvedValue(value) },
      $transaction: jest.fn(async callback => callback(tx)),
    }
    const allocation = { allocate: jest.fn() }
    return {
      service: new BuyerFinderClassifierService(
        prisma as any,
        { generate } as any,
        allocation as any,
      ),
      generate,
      allocation,
      tx,
    }
  }

  it('rejects praise without spending an AI request', async () => {
    const setup = serviceFor(comment('Beautiful house!'))
    const result = await setup.service.classify(11)

    expect(setup.generate).not.toHaveBeenCalled()
    expect(result?.is_high_intent).toBe(false)
    expect(setup.allocation.allocate).not.toHaveBeenCalled()
  })

  it('uses the deterministic intent fallback when providers are unavailable', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('quota'))
    const setup = serviceFor(
      comment('How much? Can I inspect on Saturday?'),
      generate,
    )
    const result = await setup.service.classify(11)

    expect(generate).toHaveBeenCalled()
    expect(result?.is_high_intent).toBe(true)
    expect(result?.intent_score).toBe(8)
    expect(setup.allocation.allocate).toHaveBeenCalledWith(22)
  })
})
