import { Injectable, Logger } from '@nestjs/common'
import { addDays } from 'date-fns'
import { AiRoutingService } from 'src/ai-routing/ai-routing.service'
import { AiWorkload } from 'src/ai-routing/ai-routing.types'
import { PrismaService } from 'src/prisma/prisma.service'

type MediaCandidate = {
  url: string
  assetId: number | null
  source: string
  searchText: string
  createdAt: Date
  lastUsedAt: Date | null
  useCount: number
}

@Injectable()
export class MediaIntelligenceService {
  private readonly logger = new Logger(MediaIntelligenceService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouting: AiRoutingService,
  ) {}

  async selectForPost(
    companyId: number,
    input: { kind: string; topic?: string | null; property?: any },
  ): Promise<{ url: string; assetId: number | null; source: string } | null> {
    const assets = await this.prisma.company_assets.findMany({
      where: { company_id: companyId, file_type: 'image' },
      orderBy: [{ use_count: 'asc' }, { created_at: 'desc' }],
    })
    const properties = input.property
      ? [input.property]
      : await this.prisma.properties.findMany({
          where: { company_id: companyId, status: 'available', image_urls: { not: null } },
          orderBy: { created_at: 'desc' },
        })

    const candidates: MediaCandidate[] = assets.map(asset => ({
      url: asset.file_url,
      assetId: asset.id,
      source: asset.source,
      searchText: [asset.file_name, asset.description, asset.ai_summary, asset.ai_tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      createdAt: asset.created_at,
      lastUsedAt: asset.last_used_at,
      useCount: asset.use_count,
    }))

    for (const property of properties) {
      const context = [
        property.title,
        property.description,
        property.property_type,
        property.location,
        property.state,
        property.features,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      for (const url of this.urls(property.image_urls)) {
        candidates.push({
          url,
          assetId: null,
          source: `property:${property.id}`,
          searchText: context,
          createdAt: property.created_at,
          lastUsedAt: null,
          useCount: 0,
        })
      }
    }

    const unique = [...new Map(candidates.map(item => [item.url, item])).values()]
    if (!unique.length) return null

    const minReuseDays = Number(process.env.MEDIA_MIN_REUSE_DAYS || 14)
    const cutoff = addDays(new Date(), -Math.max(1, minReuseDays))
    const recent = await this.prisma.content_posts.findMany({
      where: { company_id: companyId, created_at: { gte: cutoff }, image_urls: { not: null } },
      select: { image_urls: true },
    })
    const recentlyUsed = new Set(recent.flatMap(row => this.urls(row.image_urls)))
    const fresh = unique.filter(item => !recentlyUsed.has(item.url))
    const pool = fresh.length ? fresh : unique
    const queryTokens = new Set(
      [input.kind, input.topic, input.property?.title, input.property?.location, input.property?.property_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 2),
    )

    const scored = pool.map(item => {
      let score = item.useCount === 0 ? 100 : Math.max(0, 30 - item.useCount * 5)
      if (!item.lastUsedAt) score += 25
      if (input.property && item.source === `property:${input.property.id}`) score += 80
      for (const token of queryTokens) {
        if (item.searchText.includes(token)) score += 8
      }
      score += Math.max(0, 15 - (Date.now() - item.createdAt.getTime()) / 86400000)
      return { item, score }
    })
    scored.sort((a, b) => b.score - a.score || a.item.url.localeCompare(b.item.url))
    return scored[0].item
  }

  async markUsed(assetId: number | null) {
    if (!assetId) return
    await this.prisma.company_assets.update({
      where: { id: assetId },
      data: { use_count: { increment: 1 }, last_used_at: new Date() },
    })
  }

  async indexPendingAll(): Promise<number> {
    const companies = await this.prisma.company_assets.findMany({
      where: { indexed_at: null, file_type: { in: ['image', 'pdf'] } },
      distinct: ['company_id'],
      select: { company_id: true },
    })
    let indexed = 0
    for (const { company_id } of companies) indexed += await this.indexCompany(company_id)
    return indexed
  }

  async indexCompany(companyId: number): Promise<number> {
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    const budget = Math.max(0, Number(process.env.MEDIA_INDEX_DAILY_ASSET_BUDGET || 5))
    const used = await this.prisma.ai_usage_events.count({
      where: { company_id: companyId, workload: AiWorkload.MediaIndex, created_at: { gte: start } },
    })
    const remaining = Math.max(0, budget - used)
    if (!remaining) return 0
    const assets = await this.prisma.company_assets.findMany({
      where: { company_id: companyId, indexed_at: null, file_type: { in: ['image', 'pdf'] } },
      orderBy: { created_at: 'asc' },
      take: remaining,
    })
    let indexed = 0
    for (const asset of assets) {
      try {
        const result = await this.aiRouting.generate({
          workload: AiWorkload.MediaIndex,
          companyId,
          system:
            'Index business media for later social-content matching. Describe only visible or supplied facts. Return strict JSON with summary (one sentence) and tags (an array of 5-12 lowercase search phrases). Do not write customer-facing copy.',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `File: ${asset.file_name}\nExisting description: ${asset.description || 'none'}` },
                { type: 'file', data: new URL(asset.file_url), mediaType: asset.mime_type || (asset.file_type === 'pdf' ? 'application/pdf' : 'image/jpeg') },
              ],
            },
          ],
          maxOutputTokens: 300,
          temperature: 0.1,
        })
        const parsed = this.parseIndex(result.text)
        await this.prisma.company_assets.update({
          where: { id: asset.id },
          data: {
            ai_summary: parsed?.summary || asset.description || asset.file_name,
            ai_tags: parsed?.tags.join(', ') || null,
            indexed_at: new Date(),
          },
        })
        indexed++
      } catch (error) {
        this.logger.warn(`Media indexing failed for asset ${asset.id}: ${error?.message}`)
      }
    }
    return indexed
  }

  private parseIndex(raw: string): { summary: string; tags: string[] } | null {
    try {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      const value = JSON.parse(raw.slice(start, end + 1))
      const summary = String(value.summary || '').trim()
      const tags = Array.isArray(value.tags)
        ? value.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean).slice(0, 12)
        : []
      return summary ? { summary, tags } : null
    } catch {
      return null
    }
  }

  private urls(value: string | null | undefined): string[] {
    if (!value?.trim()) return []
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String).filter(url => /^https:\/\//i.test(url))
    } catch {}
    return value
      .split(/[\n,]+/)
      .map(url => url.trim())
      .filter(url => /^https:\/\//i.test(url))
  }
}
