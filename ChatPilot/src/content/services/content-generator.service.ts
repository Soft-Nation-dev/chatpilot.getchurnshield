import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { AiRoutingService } from 'src/ai-routing/ai-routing.service'
import { AiWorkload } from 'src/ai-routing/ai-routing.types'
import {
  CONTENT_SYSTEM_PROMPT,
  EDUCATIONAL_TOPICS,
  buildContentUserPrompt,
} from '../constants/content-prompt'
import { MediaIntelligenceService } from './media-intelligence.service'

@Injectable()
export class ContentGeneratorService {
  private readonly logger = new Logger(ContentGeneratorService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouting: AiRoutingService,
    private readonly media: MediaIntelligenceService,
  ) {}

  async generate(
    companyId: number,
    options: {
      kind: string
      propertyId?: number | null
      topic?: string | null
      scheduledAt?: Date | null
      platforms?: string | null
      autoApprove?: boolean
      automationGenerated?: boolean
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
    const recentPosts = await this.prisma.content_posts.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
      take: 8,
      select: { caption: true },
    })
    const selectedMedia = await this.media.selectForPost(companyId, {
      kind: options.kind,
      topic,
      property,
    })

    const drafted = await this.draft(companyId, {
      kind: options.kind,
      companyName: company.name,
      property,
      topic,
      learned,
      businessProfile: this.businessProfile(company.business_details),
      recentCaptions: recentPosts.map(row => row.caption),
      mediaContext: selectedMedia
        ? `Use the selected ${selectedMedia.source} visual as context. Keep the caption relevant to it without claiming facts that were not supplied.`
        : null,
    })

    const post = await this.prisma.content_posts.create({
      data: {
        company_id: companyId,
        property_id: property?.id ?? null,
        kind: options.kind,
        topic: topic ?? null,
        caption: drafted.caption,
        hashtags: drafted.hashtags,
        image_urls: selectedMedia?.url ?? property?.image_urls ?? null,
        platforms: options.platforms ?? 'facebook,instagram',
        status: options.autoApprove ? 'approved' : 'draft',
        scheduled_at: options.scheduledAt ?? null,
        automation_generated: options.automationGenerated ?? false,
      },
    })
    await this.media.markUsed(selectedMedia?.assetId ?? null)
    return post
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
          propertyId: useProperty ? properties[i % properties.length].id : null,
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
    const index =
      (seed + Math.floor(Date.now() / 86400000)) % EDUCATIONAL_TOPICS.length
    return EDUCATIONAL_TOPICS[index]
  }

  private async activeGuidelines(companyId: number): Promise<string | null> {
    const row = await this.prisma.learned_guidelines.findFirst({
      where: { company_id: companyId, scope: 'content', is_active: true },
      orderBy: { id: 'desc' },
    })
    return row?.guidelines ?? null
  }

  private async draft(
    companyId: number,
    input: {
      kind: string
      companyName: string
      property: any
      topic: string | null
      learned: string | null
      businessProfile: string | null
      recentCaptions: string[]
      mediaContext: string | null
    },
  ): Promise<{ caption: string; hashtags: string }> {
    const { text } = await this.aiRouting.generate({
      workload: AiWorkload.Content,
      companyId,
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
                recentCaptions: input.recentCaptions,
                mediaContext: input.mediaContext,
              }),
            },
          ],
        },
      ],
      maxOutputTokens: 1000,
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
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1))
        const caption = String(parsed.caption || '').trim()
        if (caption) {
          return { caption, hashtags: String(parsed.hashtags || '').trim() }
        }
      } catch {
        // Fall through to the guarded text parser below.
      }
    }

    const clean = raw
      .replace(/```(?:json)?/gi, '')
      .replace(/^\s*(?:caption|post)\s*:\s*/i, '')
      .trim()
    if (!clean || clean.startsWith('[') || clean.startsWith('{')) return null
    const hashStart = clean.search(/(?:^|\n)\s*#\w/)
    const caption = (hashStart >= 0 ? clean.slice(0, hashStart) : clean).trim()
    const hashtags = (hashStart >= 0 ? clean.slice(hashStart) : '')
      .split(/\s+/)
      .filter(item => /^#[\p{L}\p{N}_]+$/u.test(item))
      .slice(0, 12)
      .join(' ')
    if (caption.length < 20 || caption.length > 4000) return null
    return { caption, hashtags }
  }
}
