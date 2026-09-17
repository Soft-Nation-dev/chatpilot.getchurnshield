import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  CONTENT_SYSTEM_PROMPT,
  EDUCATIONAL_TOPICS,
  buildContentUserPrompt,
} from '../constants/content-prompt'

const CONTENT_MODEL = process.env.CONTENT_MODEL || 'gemini-3.6-flash'

@Injectable()
export class ContentGeneratorService {
  private readonly logger = new Logger(ContentGeneratorService.name)

  constructor(private readonly prisma: PrismaService) {}

  async generate(
    companyId: number,
    options: {
      kind: string
      propertyId?: number | null
      topic?: string | null
      scheduledAt?: Date | null
      platforms?: string | null
      autoApprove?: boolean
    },
  ) {
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, business_details: true },
    })
    if (!company) throw new NotFoundException('Company not found')

    let property: any = null
    if (options.propertyId) {
      property = await this.prisma.properties.findFirst({
        where: { id: options.propertyId, company_id: companyId },
      })
      if (!property) throw new NotFoundException('Property not found')
    }

    const topic =
      options.topic ??
      (options.kind === 'showcase' ? null : this.pickTopic(companyId))

    const learned = await this.activeGuidelines(companyId)

    const drafted = await this.draft({
      kind: options.kind,
      companyName: company.name,
      property,
      topic,
      learned,
      businessProfile: this.businessProfile(company.business_details),
    })

    return this.prisma.content_posts.create({
      data: {
        company_id: companyId,
        property_id: property?.id ?? null,
        kind: options.kind,
        topic: topic ?? null,
        caption: drafted.caption,
        hashtags: drafted.hashtags,
        image_urls: property?.image_urls ?? null,
        platforms: options.platforms ?? 'facebook,instagram',
        status: options.autoApprove ? 'approved' : 'draft',
        scheduled_at: options.scheduledAt ?? null,
      },
    })
  }

  async generateBatch(
    companyId: number,
    count: number,
    options: { autoApprove?: boolean } = {},
  ) {
    const properties = await this.prisma.properties.findMany({
      where: { company_id: companyId, status: 'available' },
      orderBy: { id: 'asc' },
    })

    const created: any[] = []

    for (let i = 0; i < count; i++) {
      const useProperty = properties.length > 0 && i % 3 !== 2
      const kind = useProperty
        ? 'showcase'
        : ['educational', 'tip', 'myth_buster', 'faq', 'process'][i % 5]

      try {
        const post = await this.generate(companyId, {
          kind,
          propertyId: useProperty
            ? properties[i % properties.length].id
            : null,
          autoApprove: options.autoApprove,
        })
        created.push(post)
      } catch (error) {
        this.logger.error('Batch generation item failed', error?.message)
      }
    }

    return created
  }

  private pickTopic(seed: number): string {
    const index = (seed + Math.floor(Date.now() / 86400000)) % EDUCATIONAL_TOPICS.length
    return EDUCATIONAL_TOPICS[index]
  }

  private async activeGuidelines(companyId: number): Promise<string | null> {
    const row = await this.prisma.learned_guidelines.findFirst({
      where: { company_id: companyId, scope: 'content', is_active: true },
      orderBy: { id: 'desc' },
    })
    return row?.guidelines ?? null
  }

  private async draft(input: {
    kind: string
    companyName: string
    property: any
    topic: string | null
    learned: string | null
    businessProfile: string | null
  }): Promise<{ caption: string; hashtags: string }> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')

    const google = createGoogleGenerativeAI({ apiKey })

    const { text } = await generateText({
      model: google(CONTENT_MODEL),
      system: CONTENT_SYSTEM_PROMPT,
      temperature: 0.8,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildContentUserPrompt({
                kind: input.kind,
                companyName: input.companyName,
                property: input.property,
                topic: input.topic,
                learned: input.learned,
                businessProfile: input.businessProfile,
              }),
            },
          ],
        },
      ],
    })

    const parsed = this.parse(text)
    if (!parsed) {
      throw new Error('Content generation returned an unparseable response')
    }
    return parsed
  }

  private businessProfile(value: unknown): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const details = value as Record<string, unknown>
    const description =
      typeof details.description === 'string' ? details.description.trim() : ''
    return description || null
  }

  private parse(raw: string): { caption: string; hashtags: string } | null {
    if (!raw) return null
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null

    try {
      const parsed = JSON.parse(raw.slice(start, end + 1))
      const caption = String(parsed.caption || '').trim()
      if (!caption) return null
      return { caption, hashtags: String(parsed.hashtags || '').trim() }
    } catch {
      return null
    }
  }
}
