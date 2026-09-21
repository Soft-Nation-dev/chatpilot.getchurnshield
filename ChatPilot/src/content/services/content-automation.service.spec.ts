import { ContentAutomationService } from './content-automation.service'

describe('ContentAutomationService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T05:00:00.000Z'))
  })

  afterEach(() => jest.useRealTimers())

  it('creates property, profile and educational drafts in that order', async () => {
    const settings = {
      company_id: 7,
      enabled: true,
      posts_per_day: 3,
      posting_times: ['09:00', '13:00', '18:00'],
      posting_days: [1, 2, 3, 4, 5, 6, 7],
      platforms: 'facebook,instagram',
      approval_required: true,
      property_ratio: 100,
      min_reuse_days: 14,
      timezone: 'Africa/Lagos',
    }
    const prisma = {
      content_automation_settings: {
        upsert: jest.fn().mockResolvedValue(settings),
      },
      companies: {
        findUnique: jest.fn().mockResolvedValue({
          business_details: {
            description:
              'We help first-time buyers verify and purchase homes in Lagos.',
          },
        }),
      },
      properties: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 42, image_urls: 'https://example.com/home.jpg' },
          ]),
      },
      content_posts: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }
    const generator = {
      generate: jest
        .fn()
        .mockImplementation((_companyId, input) =>
          Promise.resolve({ id: input.kind }),
        ),
    }
    const service = new ContentAutomationService(
      prisma as any,
      generator as any,
    )

    const result = await service.planCompany(7)

    expect(result.created).toBe(3)
    expect(generator.generate.mock.calls.map(call => call[1].kind)).toEqual([
      'showcase',
      'profile',
      expect.stringMatching(/educational|tip|faq|myth_buster|process/),
    ])
    expect(generator.generate.mock.calls[0][1].propertyId).toBe(42)
    expect(generator.generate.mock.calls[1][1].propertyId).toBeNull()
    expect(
      generator.generate.mock.calls.every(
        call => call[1].autoApprove === false,
      ),
    ).toBe(true)
  })

  it('keeps other draft sources running when a property is missing', async () => {
    const prisma = {
      content_automation_settings: {
        upsert: jest.fn().mockResolvedValue({
          enabled: true,
          posts_per_day: 2,
          posting_times: ['09:00', '18:00'],
          posting_days: [1, 2, 3, 4, 5, 6, 7],
          platforms: 'facebook,instagram',
          min_reuse_days: 14,
          timezone: 'Africa/Lagos',
        }),
      },
      companies: {
        findUnique: jest.fn().mockResolvedValue({
          business_details: { description: 'A trusted Lagos property agency.' },
        }),
      },
      properties: { findMany: jest.fn().mockResolvedValue([]) },
      content_posts: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }
    const generator = {
      generate: jest.fn().mockResolvedValue({ id: 1 }),
    }
    const service = new ContentAutomationService(
      prisma as any,
      generator as any,
    )

    const result = await service.planCompany(7)

    expect(result.created).toBe(1)
    expect(result.skipped?.[0]).toContain('Property draft skipped')
    expect(generator.generate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ kind: 'profile', autoApprove: false }),
    )
  })

  it('keeps the source attached to its daily time after an earlier slot passes', async () => {
    jest.setSystemTime(new Date('2026-09-15T10:00:00.000Z'))
    const prisma = {
      content_automation_settings: {
        upsert: jest.fn().mockResolvedValue({
          enabled: true,
          posts_per_day: 3,
          posting_times: ['09:00', '13:00', '18:00'],
          posting_days: [1, 2, 3, 4, 5, 6, 7],
          platforms: 'facebook,instagram',
          min_reuse_days: 14,
          timezone: 'Africa/Lagos',
        }),
      },
      companies: {
        findUnique: jest.fn().mockResolvedValue({
          business_details: { description: 'A trusted Lagos property agency.' },
        }),
      },
      properties: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 42, image_urls: 'https://example.com/home.jpg' },
          ]),
      },
      content_posts: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }
    const generator = {
      generate: jest.fn().mockResolvedValue({ id: 1 }),
    }
    const service = new ContentAutomationService(
      prisma as any,
      generator as any,
    )

    const result = await service.planCompany(7)

    expect(result.created).toBe(2)
    expect(generator.generate.mock.calls.map(call => call[1].kind)).toEqual([
      'profile',
      expect.stringMatching(/educational|tip|faq|myth_buster|process/),
    ])
  })

  it('removes only expired unapproved automatic drafts and marks new drafts', async () => {
    const settings = {
      enabled: true,
      posts_per_day: 2,
      posting_times: ['09:00', '18:00'],
      posting_days: [1, 2, 3, 4, 5, 6, 7],
      platforms: 'facebook',
      min_reuse_days: 14,
      timezone: 'Africa/Lagos',
    }
    const prisma = {
      content_automation_settings: {
        upsert: jest.fn().mockResolvedValue(settings),
      },
      companies: {
        findUnique: jest.fn().mockResolvedValue({
          business_details: { description: 'Trusted property advice.' },
        }),
      },
      properties: {
        findMany: jest.fn().mockResolvedValue([{ id: 42, image_urls: null }]),
      },
      content_posts: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    }
    const generator = { generate: jest.fn().mockResolvedValue({ id: 1 }) }
    const service = new ContentAutomationService(
      prisma as any,
      generator as any,
    )

    const result = await service.planCompany(7)

    expect(prisma.content_posts.deleteMany).toHaveBeenCalledWith({
      where: {
        company_id: 7,
        automation_generated: true,
        status: 'draft',
        OR: [
          { scheduled_at: { lt: new Date('2026-09-14T23:00:00.000Z') } },
          { scheduled_at: { gte: new Date('2026-09-15T23:00:00.000Z') } },
        ],
      },
    })
    expect(result.deleted).toBe(2)
    expect(generator.generate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        automationGenerated: true,
        autoApprove: false,
      }),
    )
  })
})
