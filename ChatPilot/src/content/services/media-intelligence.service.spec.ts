import { MediaIntelligenceService } from './media-intelligence.service'

describe('MediaIntelligenceService document extraction', () => {
  it('creates a deduplicatable Property Vault record from a PDF', async () => {
    const prisma = {
      company_assets: {
        findFirst: jest.fn().mockResolvedValue({
          id: 12,
          company_id: 6,
          file_name: 'lekki-brochure.pdf',
          file_url: 'https://cdn.test/lekki-brochure.pdf',
          mime_type: 'application/pdf',
          description: 'Lekki listings',
          property_extracted_at: null,
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            file_url: 'https://cdn.test/duplex.jpg',
            file_name: 'duplex.jpg',
            description: 'Image extracted from brochure',
            ai_summary: null,
            ai_tags: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      properties: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 91, created_at: new Date(), ...data }),
          ),
        update: jest.fn(),
      },
    } as any
    const aiRouting = {
      generate: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          properties: [
            {
              title: '4-Bedroom Fully Detached Duplex',
              description: 'A fully detached duplex in Lekki Phase 1.',
              property_type: 'Duplex',
              location: 'Lekki Phase 1',
              state: 'Lagos',
              price: 200000000,
              currency: 'NGN',
              bedrooms: 4,
              status: 'available',
            },
          ],
        }),
      }),
    } as any
    const notifications = { create: jest.fn() } as any
    const service = new MediaIntelligenceService(
      prisma,
      aiRouting,
      notifications,
    )
    jest
      .spyOn(service as any, 'extractPdfText')
      .mockResolvedValue('4-bedroom duplex in Lekki Phase 1 for NGN 200m')

    const count = await service.indexDocument(12)

    expect(count).toBe(1)
    expect(prisma.properties.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        company_id: 6,
        title: '4-Bedroom Fully Detached Duplex',
        image_urls: 'https://cdn.test/duplex.jpg',
        source_asset_id: 12,
        source_fingerprint: expect.any(String),
      }),
    })
    expect(prisma.company_assets.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: expect.objectContaining({
        property_extracted_at: expect.any(Date),
        extracted_property_count: 1,
      }),
    })
  })
})
