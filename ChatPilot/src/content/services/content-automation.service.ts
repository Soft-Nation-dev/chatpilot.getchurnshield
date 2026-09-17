import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { addDays } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { PrismaService } from 'src/prisma/prisma.service'
import { UpdateContentAutomationDto } from '../dto/content.dto'
import { ContentGeneratorService } from './content-generator.service'

const DEFAULT_TIMES = ['09:00', '18:00', '20:00']
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6, 7]

@Injectable()
export class ContentAutomationService {
  private readonly logger = new Logger(ContentAutomationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: ContentGeneratorService,
  ) {}

  async getSettings(companyId: number) {
    const settings = await this.prisma.content_automation_settings.upsert({
      where: { company_id: companyId },
      create: {
        company_id: companyId,
        posting_times: DEFAULT_TIMES.slice(0, 2),
        posting_days: DEFAULT_DAYS,
      },
      update: { approval_required: true },
    })
    if (settings.posts_per_day >= 2 && settings.posts_per_day <= 3) {
      return settings
    }
    return this.prisma.content_automation_settings.update({
      where: { company_id: companyId },
      data: { posts_per_day: 2, approval_required: true },
    })
  }

  async updateSettings(companyId: number, dto: UpdateContentAutomationDto) {
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone }).format()
      } catch {
        throw new BadRequestException('Choose a valid IANA time zone')
      }
    }

    return this.prisma.content_automation_settings.upsert({
      where: { company_id: companyId },
      create: {
        company_id: companyId,
        enabled: dto.enabled ?? false,
        posts_per_day: dto.posts_per_day ?? 2,
        posting_times: dto.posting_times ?? DEFAULT_TIMES.slice(0, 2),
        posting_days: dto.posting_days ?? DEFAULT_DAYS,
        platforms: dto.platforms ?? 'facebook,instagram',
        approval_required: true,
        property_ratio: dto.property_ratio ?? 100,
        min_reuse_days: dto.min_reuse_days ?? 14,
        timezone: dto.timezone ?? 'Africa/Lagos',
      },
      update: {
        ...(dto.enabled === undefined ? {} : { enabled: dto.enabled }),
        ...(dto.posts_per_day === undefined
          ? {}
          : { posts_per_day: dto.posts_per_day }),
        ...(dto.posting_times === undefined
          ? {}
          : { posting_times: dto.posting_times }),
        ...(dto.posting_days === undefined
          ? {}
          : { posting_days: dto.posting_days }),
        ...(dto.platforms === undefined ? {} : { platforms: dto.platforms }),
        approval_required: true,
        ...(dto.property_ratio === undefined
          ? {}
          : { property_ratio: dto.property_ratio }),
        ...(dto.min_reuse_days === undefined
          ? {}
          : { min_reuse_days: dto.min_reuse_days }),
        ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
      },
    })
  }

  async planAll() {
    const settings = await this.prisma.content_automation_settings.findMany({
      where: { enabled: true },
      select: { company_id: true },
    })

    let created = 0
    for (const row of settings) {
      try {
        created += (await this.planCompany(row.company_id)).created
      } catch (error) {
        this.logger.error(
          `Content planning failed for company ${row.company_id}`,
          error?.message,
        )
      }
    }
    return created
  }

  async planCompany(companyId: number, force = false) {
    const settings = await this.getSettings(companyId)
    if (!settings.enabled && !force) return { created: 0, posts: [] }

    const platforms = settings.platforms || 'facebook,instagram'
    const needsImage = platforms.split(',').includes('instagram')
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { business_details: true },
    })
    const businessProfile = this.businessProfile(company?.business_details)
    const properties = await this.prisma.properties.findMany({
      where: {
        company_id: companyId,
        status: 'available',
        ...(needsImage
          ? { image_urls: { not: null } }
          : {}),
      },
      orderBy: { created_at: 'asc' },
    })

    const usableProperties = properties.filter(
      property => !needsImage || Boolean(property.image_urls?.trim()),
    )
    const recentCutoff = addDays(new Date(), -settings.min_reuse_days)
    const recentlyUsed = await this.prisma.content_posts.findMany({
      where: {
        company_id: companyId,
        property_id: { not: null },
        created_at: { gte: recentCutoff },
      },
      select: { property_id: true },
    })
    const recentIds = new Set(
      recentlyUsed.map(row => row.property_id).filter(Boolean) as number[],
    )
    const freshProperties = usableProperties.filter(row => !recentIds.has(row.id))
    const propertyPool = freshProperties.length ? freshProperties : usableProperties

    const times = this.stringArray(settings.posting_times, DEFAULT_TIMES)
      .slice(0, settings.posts_per_day)
    while (times.length < settings.posts_per_day) {
      times.push(DEFAULT_TIMES[times.length] ?? '20:00')
    }
    const postingDays = new Set(
      this.numberArray(settings.posting_days, DEFAULT_DAYS),
    )

    const now = new Date()
    const slots: Array<{ scheduledAt: Date; sourceIndex: number }> = []
    for (let offset = 0; offset < 7 && slots.length === 0; offset++) {
      const candidate = addDays(now, offset)
      const date = formatInTimeZone(candidate, settings.timezone, 'yyyy-MM-dd')
      const weekday = Number(formatInTimeZone(candidate, settings.timezone, 'i'))
      if (!postingDays.has(weekday)) continue

      for (const [sourceIndex, time] of times.entries()) {
        const slot = fromZonedTime(`${date}T${time}:00`, settings.timezone)
        if (slot.getTime() <= now.getTime() + 5 * 60 * 1000) continue
        slots.push({ scheduledAt: slot, sourceIndex })
      }
    }

    const created: any[] = []
    const skipped: string[] = []
    const randomKinds = ['educational', 'tip', 'faq', 'myth_buster', 'process']
    for (const { scheduledAt, sourceIndex } of slots) {
      const duplicate = await this.prisma.content_posts.findFirst({
        where: { company_id: companyId, scheduled_at: scheduledAt },
        select: { id: true },
      })
      if (duplicate) continue

      const source = ['property', 'profile', 'random'][sourceIndex] ?? 'random'
      if (source === 'property' && !propertyPool.length) {
        skipped.push(
          needsImage
            ? 'Property draft skipped: add an available property with an image.'
            : 'Property draft skipped: add an available property to the Property Vault.',
        )
        continue
      }
      if (source === 'profile' && !businessProfile) {
        skipped.push('Profile draft skipped: add a business description in Setup or Settings.')
        continue
      }

      const property =
        source === 'property'
          ? propertyPool[(companyId + Math.floor(Date.now() / 86400000)) % propertyPool.length]
          : null
      const kind =
        source === 'property'
          ? 'showcase'
          : source === 'profile'
            ? 'profile'
            : randomKinds[(companyId + Math.floor(Date.now() / 86400000)) % randomKinds.length]

      const post = await this.generator.generate(companyId, {
        kind,
        propertyId: property?.id ?? null,
        scheduledAt,
        platforms,
        autoApprove: false,
      })
      created.push(post)
    }

    return { created: created.length, posts: created, skipped }
  }

  private businessProfile(value: unknown): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const description = (value as Record<string, unknown>).description
    return typeof description === 'string' && description.trim()
      ? description.trim()
      : null
  }

  private stringArray(value: unknown, fallback: string[]) {
    return Array.isArray(value) && value.every(item => typeof item === 'string')
      ? value
      : fallback
  }

  private numberArray(value: unknown, fallback: number[]) {
    return Array.isArray(value) && value.every(item => Number.isInteger(item))
      ? (value as number[])
      : fallback
  }
}
