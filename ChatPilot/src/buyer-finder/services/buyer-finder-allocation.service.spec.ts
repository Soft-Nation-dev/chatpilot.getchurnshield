import { BuyerFinderAllocationService } from './buyer-finder-allocation.service'

describe('BuyerFinderAllocationService', () => {
  it('locks, allocates an owned-social candidate once, and notifies its company', async () => {
    const candidate = {
      id: 19,
      is_high_intent: true,
      intent_score: 9,
      intent_reason: 'Asked for price',
      location_state: 'Lagos',
      phone_normalized: null,
      comment: {
        author_name: 'Buyer',
        author_profile_url: null,
        comment_text: 'How much is this house?',
        post: { account: { company_id: 7, source: 'connected_social' } },
      },
    }
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: '' }]),
      buyer_finder_candidates: {
        findUnique: jest.fn().mockResolvedValue(candidate),
      },
      buyer_finder_settings: {
        findMany: jest.fn().mockResolvedValue([
          {
            company_id: 7,
            shadow_mode: true,
            exclusivity_limit: 2,
            company: { id: 7, name: 'Acme Homes' },
          },
        ]),
      },
      buyer_finder_allocations: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 55 }),
      },
    }
    const prisma = {
      $transaction: jest.fn(async callback => callback(tx)),
    }
    const notifications = { create: jest.fn().mockResolvedValue({ id: 1 }) }
    const service = new BuyerFinderAllocationService(
      prisma as any,
      notifications as any,
    )

    const created = await service.allocate(19)

    expect(created).toBe(1)
    expect(tx.$queryRaw).toHaveBeenCalled()
    expect(tx.buyer_finder_settings.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ company_id: 7 }),
      }),
    )
    expect(tx.buyer_finder_allocations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidate_id: 19,
        company_id: 7,
        status: 'shadow',
      }),
    })
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        type: 'buyer_finder_match',
        entityId: 55,
      }),
    )
  })
})
