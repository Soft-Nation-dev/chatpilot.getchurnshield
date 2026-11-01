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
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
              image_indices: [1],
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

  it('uses extracted images for a scanned PDF instead of sending the raw PDF', async () => {
    const extractedImage = {
      file_url: 'https://cdn.test/scanned-page.jpg',
      file_name: 'scanned-page.jpg',
      mime_type: 'image/jpeg',
      description: 'Page extracted from brochure',
      ai_summary: null,
      ai_tags: null,
    }
    const prisma = {
      company_assets: {
        findFirst: jest.fn().mockResolvedValue({
          id: 19,
          company_id: 6,
          file_name: 'scanned-brochure.pdf',
          file_url: 'https://cdn.test/scanned-brochure.pdf',
          mime_type: 'application/pdf',
          description: null,
          property_extracted_at: null,
        }),
        findMany: jest.fn().mockResolvedValue([extractedImage]),
        update: jest.fn().mockResolvedValue({}),
      },
      properties: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    } as any
    const aiRouting = {
      generate: jest.fn().mockResolvedValue({ text: '{"properties":[]}' }),
    } as any
    const notifications = { create: jest.fn() } as any
    const service = new MediaIntelligenceService(
      prisma,
      aiRouting,
      notifications,
    )
    jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(null)

    await service.indexDocument(19)

    const request = aiRouting.generate.mock.calls[0][0]
    const content = request.messages[0].content
    expect(content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'file',
          data: new URL(extractedImage.file_url),
          mediaType: 'image/jpeg',
        }),
      ]),
    )
    expect(content).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mediaType: 'application/pdf' }),
      ]),
    )
  })

  it('uses page OCR text for deterministic image mapping without a vision request', async () => {
    const page = {
      file_url: 'https://cdn.test/page-1.jpg',
      file_name: 'brochure-page-1.jpg',
      mime_type: 'image/jpeg',
      description:
        'Rendered page 1 from PDF\nPage text:\n4-bedroom duplex in Lekki for NGN 200,000,000',
      ai_summary: null,
      ai_tags: null,
    }
    const prisma = {
      company_assets: {
        findFirst: jest.fn().mockResolvedValue({
          id: 31,
          company_id: 6,
          file_name: 'brochure.pdf',
          file_url: 'https://cdn.test/brochure.pdf',
          description: null,
          property_extracted_at: null,
        }),
        findMany: jest.fn().mockResolvedValue([page]),
        update: jest.fn().mockResolvedValue({}),
      },
      properties: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    } as any
    const aiRouting = {
      generate: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          properties: [
            {
              title: '4-bedroom duplex',
              location: 'Lekki',
              price: 200000000,
              image_indices: [1],
            },
          ],
        }),
      }),
    } as any
    const service = new MediaIntelligenceService(prisma, aiRouting, {
      create: jest.fn(),
    } as any)
    jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(null)

    await service.indexDocument(31)

    const request = aiRouting.generate.mock.calls[0][0]
    expect(request.workload).toBe('content')
    expect(request.prompt).toContain('4-bedroom duplex in Lekki')
    expect(request.messages).toBeUndefined()
    expect(prisma.properties.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ image_urls: page.file_url }),
    })
  })

  it('samples long PDF text across the document within the model budget', () => {
    const service = new MediaIntelligenceService(
      {} as any,
      {} as any,
      {} as any,
    )
    const text = `${'A'.repeat(10_000)}${'B'.repeat(10_000)}${'C'.repeat(10_000)}`

    const sampled = (service as any).samplePdfText(text, 12_000)

    expect(sampled.length).toBeLessThan(12_200)
    expect(sampled).toContain('A')
    expect(sampled).toContain('B')
    expect(sampled).toContain('C')
  })

  it('maps each listing only to the explicit PDF image selected by the model', () => {
    const service = new MediaIntelligenceService(
      {} as any,
      {} as any,
      {} as any,
    )
    const children = [
      { file_url: 'https://cdn.test/one.jpg', file_name: 'one.jpg' },
      { file_url: 'https://cdn.test/two.jpg', file_name: 'two.jpg' },
    ].map(item => ({
      ...item,
      description: null,
      ai_summary: null,
      ai_tags: null,
    }))

    const selected = (service as any).imagesForExtractedProperty(
      { title: 'Second Duplex', image_indices: [2] },
      children,
      2,
      1,
    )

    expect(selected).toEqual(['https://cdn.test/two.jpg'])
  })

  it('does not deduplicate generic titles without corroborating facts', () => {
    const service = new MediaIntelligenceService(
      {} as any,
      {} as any,
      {} as any,
    )

    expect(
      (service as any).isDuplicateProperty(
        { title: 'Duplex', property_type: 'Duplex' },
        { title: 'Duplex', property_type: 'Duplex' },
      ),
    ).toBe(false)
    expect(
      (service as any).isDuplicateProperty(
        { title: 'Duplex', location: 'Lekki', price: 200_000_000 },
        { title: 'Duplex', location: 'Lekki', price: 200_000_000 },
      ),
    ).toBe(true)
  })

  it('extracts balanced property JSON after provider reasoning and markdown', () => {
    const service = new MediaIntelligenceService(
      {} as any,
      {} as any,
      {} as any,
    )
    const response = [
      '<think>I considered {several} possibilities.</think>',
      '```json',
      '{"properties":[{"title":"Lekki Duplex","description":"Has a {private} garden"}]}',
      '```',
    ].join('\n')

    expect((service as any).parseDocumentProperties(response)).toEqual([
      {
        title: 'Lekki Duplex',
        description: 'Has a {private} garden',
      },
    ])
  })

  it('rejects truncated property JSON instead of guessing missing data', () => {
    const service = new MediaIntelligenceService(
      {} as any,
      {} as any,
      {} as any,
    )

    expect(
      (service as any).parseDocumentProperties(
        '{"properties":[{"title":"Incomplete listing"}',
      ),
    ).toBeNull()
  })

  it('normalizes model list fields before saving them as property text', () => {
    const service = new MediaIntelligenceService(
      {} as any,
      {} as any,
      {} as any,
    )

    expect((service as any).cleanText(['Swimming pool', 'Gym'], 3000)).toBe(
      'Swimming pool, Gym',
    )
  })
})
