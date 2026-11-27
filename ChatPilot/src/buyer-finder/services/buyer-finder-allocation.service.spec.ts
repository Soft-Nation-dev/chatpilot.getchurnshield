import { BuyerFinderAllocationService } from './buyer-finder-allocation.service'

describe('BuyerFinderAllocationService', () => {
  it('allocates an owned-social candidate only to the source company', async () => {
    const candidate = {
      id: 19,
      is_high_intent: true,
      intent_score: 9,
      location_state: 'Lagos',
      comment: {
        author_name: 'Buyer',
        author_profile_url: null,
        comment_text: 'How much is this house?',
        post: { account: { company_id: 7, source: 'connected_social' } },
      },
    }
    const prisma = {
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
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    }
    const service = new BuyerFinderAllocationService(prisma as any)

    const created = await service.allocate(19)

    expect(created).toBe(1)
    expect(prisma.buyer_finder_settings.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ company_id: 7 }),
      }),
    )
    expect(prisma.buyer_finder_allocations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidate_id: 19,
        company_id: 7,
        status: 'shadow',
      }),
    })
  })
})
