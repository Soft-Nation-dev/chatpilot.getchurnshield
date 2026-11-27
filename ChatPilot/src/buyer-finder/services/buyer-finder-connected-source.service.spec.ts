import { BuyerFinderConnectedSourceService } from './buyer-finder-connected-source.service'

describe('BuyerFinderConnectedSourceService', () => {
  const socialRow = {
    id: 31,
    company_id: 7,
    platform: 'facebook',
    external_id: 'page-1',
    page_id: 'page-1',
    ig_user_id: null,
    name: 'Acme Homes',
    username: null,
    access_token: 'encrypted-token',
    token_expires_at: null,
    last_error: null,
    is_active: true,
  }

  function setup() {
    const prisma = {
      social_accounts: {
        findMany: jest.fn().mockResolvedValue([socialRow]),
        findUnique: jest.fn().mockResolvedValue(socialRow),
      },
      buyer_finder_accounts: {
        upsert: jest.fn().mockResolvedValue({ id: 44 }),
        update: jest.fn().mockResolvedValue({ id: 44 }),
      },
    }
    const graph = {
      get: jest.fn().mockResolvedValue({
        success: true,
        error: null,
        isAuthError: false,
        data: { data: [{ id: 'post-1', message: 'House for sale' }] },
      }),
    }
    const socialAccounts = {
      token: jest.fn().mockReturnValue('page-token'),
      clearError: jest.fn().mockResolvedValue(undefined),
      recordError: jest.fn().mockResolvedValue(undefined),
    }
    return {
      service: new BuyerFinderConnectedSourceService(
        prisma as any,
        graph as any,
        socialAccounts as any,
      ),
      prisma,
      graph,
      socialAccounts,
    }
  }

  it('maps each connected Meta account to the company that owns it', async () => {
    const setupValue = setup()
    const result = await setupValue.service.sync([
      { company_id: 7, target_states: ['Lagos'] },
    ])

    expect(result.companyIds.has(7)).toBe(true)
    expect(setupValue.prisma.buyer_finder_accounts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          company_id: 7,
          social_account_id: 31,
          source: 'connected_social',
          platform: 'facebook',
          external_id: 'page-1',
        }),
      }),
    )
  })

  it('reads owned Page posts through Graph API without copying the token', async () => {
    const setupValue = setup()
    const rows = await setupValue.service.fetchPosts(
      {
        id: 44,
        platform: 'facebook',
        external_id: 'page-1',
        social_account_id: 31,
      },
      48,
    )

    expect(rows).toHaveLength(1)
    expect(setupValue.socialAccounts.token).toHaveBeenCalledWith(socialRow)
    expect(setupValue.graph.get).toHaveBeenCalledWith(
      'page-1/published_posts',
      expect.objectContaining({ access_token: 'page-token', limit: 10 }),
    )
  })
})
