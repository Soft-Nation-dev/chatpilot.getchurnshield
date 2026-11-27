import { BuyerFinderService } from './buyer-finder.service'

describe('BuyerFinderService', () => {
  it('persists discovery immediately while enforcing shadow review', async () => {
    const prisma = {
      buyer_finder_settings: {
        upsert: jest.fn().mockResolvedValue({
          company_id: 7,
          enabled: true,
          shadow_mode: true,
        }),
      },
    }
    const service = new BuyerFinderService(
      prisma as any,
      { sync: jest.fn(), status: jest.fn() } as any,
      { add: jest.fn() } as any,
    )

    await service.updateSettings(7, {
      enabled: true,
      shadow_mode: false,
    })

    expect(prisma.buyer_finder_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          enabled: true,
          shadow_mode: true,
        }),
        update: expect.objectContaining({
          enabled: true,
          shadow_mode: true,
        }),
      }),
    )
  })
})
