import { Injectable, Logger } from '@nestjs/common'
import { addDays } from 'date-fns'
import { AiRoutingService } from 'src/ai-routing/ai-routing.service'
import { AiWorkload } from 'src/ai-routing/ai-routing.types'
import { PrismaService } from 'src/prisma/prisma.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { createHash } from 'node:crypto'

type MediaCandidate = {
  url: string
  assetId: number | null
  source: string
  searchText: string
  createdAt: Date
  lastUsedAt: Date | null
  useCount: number
}

type ExtractedProperty = {
  title: string
  description?: string | null
  property_type?: string | null
  location?: string | null
  state?: string | null
  price?: number | null
  price_max?: number | null
  currency?: string | null
  size_sqm?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  title_document?: string | null
  payment_plan?: string | null
  features?: string | null
  status?: string | null
}

@Injectable()
export class MediaIntelligenceService {
  private readonly logger = new Logger(MediaIntelligenceService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouting: AiRoutingService,
    private readonly notifications: NotificationsService,
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
          where: {
            company_id: companyId,
            status: 'available',
            image_urls: { not: null },
          },
          orderBy: { created_at: 'desc' },
        })

    const candidates: MediaCandidate[] = assets.map(asset => ({
      url: asset.file_url,
      assetId: asset.id,
      source: asset.source,
      searchText: [
        asset.file_name,
        asset.description,
        asset.ai_summary,
        asset.ai_tags,
      ]
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

    const unique = [
      ...new Map(candidates.map(item => [item.url, item])).values(),
    ]
    if (!unique.length) return null

    const minReuseDays = Number(process.env.MEDIA_MIN_REUSE_DAYS || 14)
    const cutoff = addDays(new Date(), -Math.max(1, minReuseDays))
    const recent = await this.prisma.content_posts.findMany({
      where: {
        company_id: companyId,
        created_at: { gte: cutoff },
        image_urls: { not: null },
      },
      select: { image_urls: true },
    })
    const recentlyUsed = new Set(
      recent.flatMap(row => this.urls(row.image_urls)),
    )
    const fresh = unique.filter(item => !recentlyUsed.has(item.url))
    const pool = fresh.length ? fresh : unique
    const queryTokens = new Set(
      [
        input.kind,
        input.topic,
        input.property?.title,
        input.property?.location,
        input.property?.property_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 2),
    )

    const scored = pool.map(item => {
      let score =
        item.useCount === 0 ? 100 : Math.max(0, 30 - item.useCount * 5)
      if (!item.lastUsedAt) {
        score += 25
      }
      if (input.property && item.source === `property:${input.property.id}`) {
        score += 80
      }
      for (const token of queryTokens) {
        if (item.searchText.includes(token)) {
          score += 8
        }
      }
      score += Math.max(
        0,
        15 - (Date.now() - item.createdAt.getTime()) / 86400000,
      )
      return { item, score }
    })
    scored.sort(
      (a, b) => b.score - a.score || a.item.url.localeCompare(b.item.url),
    )
    return scored[0].item
  }

  async markUsed(assetId: number | null) {
    if (!assetId) {
      return
    }
    await this.prisma.company_assets.update({
      where: { id: assetId },
      data: { use_count: { increment: 1 }, last_used_at: new Date() },
    })
  }

  async indexPendingAll(): Promise<number> {
    const companies = await this.prisma.company_assets.findMany({
      where: {
        OR: [
          { indexed_at: null, file_type: 'image' },
          { property_extracted_at: null, file_type: 'pdf' },
          { indexed_at: null, file_type: 'pdf' },
        ],
      },
      distinct: ['company_id'],
      select: { company_id: true },
    })
    let indexed = 0
    for (const { company_id } of companies) {
      indexed += await this.indexCompany(company_id)
    }
    return indexed
  }

  async indexCompany(companyId: number): Promise<number> {
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    const budget = Math.max(
      0,
      Number(process.env.MEDIA_INDEX_DAILY_ASSET_BUDGET || 5),
    )
    const used = await this.prisma.ai_usage_events.count({
      where: {
        company_id: companyId,
        workload: AiWorkload.MediaIndex,
        created_at: { gte: start },
      },
    })
    const remaining = Math.max(0, budget - used)
    const documents = remaining
      ? await this.prisma.company_assets.findMany({
          where: {
            company_id: companyId,
            file_type: 'pdf',
            property_extracted_at: null,
          },
          orderBy: { created_at: 'asc' },
          take: Math.min(2, remaining),
        })
      : []
    let indexed = 0
    for (const document of documents) {
      try {
        await this.indexDocument(document.id, false)
        indexed++
      } catch (error) {
        this.logger.warn(
          `Property extraction failed for document ${document.id}: ${error?.message}`,
        )
      }
    }
    const imageBudget = Math.max(0, remaining - documents.length)
    const assets = imageBudget
      ? await this.prisma.company_assets.findMany({
          where: {
            company_id: companyId,
            indexed_at: null,
            file_type: 'image',
          },
          orderBy: { created_at: 'asc' },
          take: imageBudget,
        })
      : []
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
                {
                  type: 'text',
                  text: `File: ${asset.file_name}\nExisting description: ${asset.description || 'none'}`,
                },
                {
                  type: 'file',
                  data: new URL(asset.file_url),
                  mediaType:
                    asset.mime_type ||
                    (asset.file_type === 'pdf'
                      ? 'application/pdf'
                      : 'image/jpeg'),
                },
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
        this.logger.warn(
          `Media indexing failed for asset ${asset.id}: ${error?.message}`,
        )
      }
    }
    await this.refreshDocumentPropertyMedia(companyId)
    indexed += await this.indexDocumentParents(companyId)
    if (indexed) {
      await this.notifications.create({
        companyId,
        type: 'media_indexed',
        severity: 'success',
        title: `${indexed} knowledge item${indexed === 1 ? '' : 's'} indexed`,
        message:
          'New property records and business media are now available for smarter chat and content matching.',
        entity: 'media',
      })
    }
    return indexed
  }

  async indexDocument(
    assetId: number,
    notify: boolean = true,
  ): Promise<number> {
    const document = await this.prisma.company_assets.findFirst({
      where: { id: assetId, file_type: 'pdf' },
    })
    if (!document) return 0
    if (document.property_extracted_at) {
      return document.extracted_property_count
    }

    const documentText = await this.extractPdfText(document.file_url)
    const result = await this.aiRouting.generate({
      workload: documentText ? AiWorkload.Content : AiWorkload.MediaIndex,
      companyId: document.company_id,
      system:
        'Extract only explicitly stated real-estate listings from the supplied PDF. Never infer or invent a price, location, title document, availability, room count, or feature. Return strict JSON only: {"properties":[{"title":"","description":null,"property_type":null,"location":null,"state":null,"price":null,"price_max":null,"currency":"NGN","size_sqm":null,"bedrooms":null,"bathrooms":null,"title_document":null,"payment_plan":null,"features":null,"status":"available|reserved|sold|hidden"}]}. Use numeric naira values without commas. Omit brochures that contain no identifiable property listings by returning an empty properties array. Keep each description factual and under 600 characters.',
      messages: documentText
        ? [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Extract the distinct property listings in ${document.file_name}. Existing description: ${document.description || 'none'}\n\nPDF text:\n${documentText}`,
                },
              ],
            },
          ]
        : [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Extract the distinct property listings in ${document.file_name}. Existing description: ${document.description || 'none'}`,
                },
                {
                  type: 'file',
                  data: new URL(document.file_url),
                  mediaType: document.mime_type || 'application/pdf',
                },
              ],
            },
          ],
      maxOutputTokens: 2200,
      temperature: 0.1,
    })
    const extracted = this.parseDocumentProperties(result.text)
    const saved = await this.saveDocumentProperties(document, extracted)
    await this.prisma.company_assets.update({
      where: { id: document.id },
      data: {
        property_extracted_at: new Date(),
        extracted_property_count: saved,
      },
    })
    if (notify) {
      await this.notifications.create({
        companyId: document.company_id,
        type: 'property_indexed',
        severity: saved ? 'success' : 'info',
        title: saved
          ? `${saved} propert${saved === 1 ? 'y' : 'ies'} extracted`
          : 'PDF indexing completed',
        message: saved
          ? `${document.file_name} was converted into deduplicated Property Vault records.`
          : `${document.file_name} did not contain a new identifiable property listing.`,
        entity: 'property',
      })
    }
    return saved
  }

  private async saveDocumentProperties(
    document: {
      id: number
      company_id: number
    },
    extracted: ExtractedProperty[],
  ): Promise<number> {
    const current = await this.prisma.properties.findMany({
      where: { company_id: document.company_id },
    })
    const children = await this.prisma.company_assets.findMany({
      where: {
        company_id: document.company_id,
        source: 'document-extract',
        source_ref: String(document.id),
        file_type: 'image',
      },
    })
    let saved = 0
    for (const property of extracted.slice(0, 50)) {
      const title = this.cleanText(property.title, 200)
      if (!title) continue
      const location = this.cleanText(property.location, 120)
      const fingerprint = createHash('sha256')
        .update(`${this.normalized(title)}|${this.normalized(location || '')}`)
        .digest('hex')
      const duplicate = current.find(
        item =>
          this.normalized(item.title) === this.normalized(title) &&
          (!location ||
            !item.location ||
            this.normalized(item.location) === this.normalized(location)),
      )
      const images = this.imagesForExtractedProperty(
        property,
        children,
        extracted.length,
      )
      if (duplicate) {
        const mergedImages = [
          ...new Set([...this.urls(duplicate.image_urls), ...images]),
        ]
        await this.prisma.properties.update({
          where: { id: duplicate.id },
          data: {
            description: duplicate.description || property.description || null,
            property_type:
              duplicate.property_type || property.property_type || null,
            location: duplicate.location || location || null,
            state: duplicate.state || this.cleanText(property.state, 60),
            price: duplicate.price || this.bigInt(property.price),
            price_max: duplicate.price_max || this.bigInt(property.price_max),
            size_sqm: duplicate.size_sqm || this.integer(property.size_sqm),
            bedrooms: duplicate.bedrooms || this.integer(property.bedrooms),
            bathrooms: duplicate.bathrooms || this.integer(property.bathrooms),
            title_document:
              duplicate.title_document ||
              this.cleanText(property.title_document, 60),
            payment_plan:
              duplicate.payment_plan || property.payment_plan || null,
            features: duplicate.features || property.features || null,
            image_urls: mergedImages.length
              ? mergedImages.slice(0, 10).join(',')
              : duplicate.image_urls,
          },
        })
        saved++
        continue
      }
      const created = await this.prisma.properties.create({
        data: {
          company_id: document.company_id,
          title,
          description: this.cleanText(property.description, 3000),
          property_type: this.cleanText(property.property_type, 50),
          location,
          state: this.cleanText(property.state, 60),
          price: this.bigInt(property.price),
          price_max: this.bigInt(property.price_max),
          currency: this.cleanText(property.currency, 8) || 'NGN',
          size_sqm: this.integer(property.size_sqm),
          bedrooms: this.integer(property.bedrooms),
          bathrooms: this.integer(property.bathrooms),
          title_document: this.cleanText(property.title_document, 60),
          payment_plan: this.cleanText(property.payment_plan, 1000),
          features: this.cleanText(property.features, 3000),
          image_urls: images.length ? images.slice(0, 10).join(',') : null,
          status: this.propertyStatus(property.status),
          source_asset_id: document.id,
          source_fingerprint: fingerprint,
        },
      })
      current.push(created)
      saved++
    }
    return saved
  }

  private async refreshDocumentPropertyMedia(companyId: number) {
    const properties = await this.prisma.properties.findMany({
      where: { company_id: companyId, source_asset_id: { not: null } },
    })
    const groups = new Map<number, typeof properties>()
    for (const property of properties) {
      if (!property.source_asset_id) continue
      const group = groups.get(property.source_asset_id) || []
      group.push(property)
      groups.set(property.source_asset_id, group)
    }
    for (const [assetId, group] of groups) {
      const children = await this.prisma.company_assets.findMany({
        where: {
          company_id: companyId,
          source: 'document-extract',
          source_ref: String(assetId),
          file_type: 'image',
        },
      })
      for (const property of group) {
        const selected = this.imagesForExtractedProperty(
          {
            title: property.title,
            location: property.location,
            property_type: property.property_type,
          },
          children,
          group.length,
        )
        const merged = [
          ...new Set([...this.urls(property.image_urls), ...selected]),
        ].slice(0, 10)
        if (merged.join(',') === (property.image_urls || '')) continue
        await this.prisma.properties.update({
          where: { id: property.id },
          data: { image_urls: merged.length ? merged.join(',') : null },
        })
      }
    }
  }

  private imagesForExtractedProperty(
    property: ExtractedProperty,
    children: Array<{
      file_url: string
      file_name: string
      description: string | null
      ai_summary: string | null
      ai_tags: string | null
    }>,
    propertyCount: number,
  ): string[] {
    if (propertyCount === 1) return children.map(child => child.file_url)
    const tokens = new Set(
      [property.title, property.location, property.property_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 3),
    )
    return children
      .map(child => {
        const text = [
          child.file_name,
          child.description,
          child.ai_summary,
          child.ai_tags,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        const score = [...tokens].filter(token => text.includes(token)).length
        return { url: child.file_url, score }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.url)
  }

  private parseDocumentProperties(raw: string): ExtractedProperty[] {
    try {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start < 0 || end <= start) return []
      const parsed = JSON.parse(raw.slice(start, end + 1))
      return Array.isArray(parsed?.properties)
        ? parsed.properties.filter(
            (item: unknown) =>
              item &&
              typeof item === 'object' &&
              typeof (item as any).title === 'string',
          )
        : []
    } catch {
      return []
    }
  }

  private async extractPdfText(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) return null
      const length = Number(response.headers.get('content-length') || 0)
      if (length > 25 * 1024 * 1024) return null
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length || buffer.length > 25 * 1024 * 1024) return null
      const pdfParse = require('pdf-parse') as (
        input: Buffer,
      ) => Promise<{ text?: string }>
      const parsed = await pdfParse(buffer)
      const text = String(parsed?.text || '')
        .replace(/\u0000/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      return text.length >= 40 ? text.slice(0, 40_000) : null
    } catch (error) {
      this.logger.warn(`Local PDF text extraction failed: ${error?.message}`)
      return null
    }
  }

  private propertyStatus(value?: string | null): string {
    const normalized = String(value || '').toLowerCase()
    return ['available', 'reserved', 'sold', 'hidden'].includes(normalized)
      ? normalized
      : 'available'
  }

  private integer(value?: number | null): number | null {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null
  }

  private bigInt(value?: number | null): bigint | null {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0
      ? BigInt(Math.round(parsed))
      : null
  }

  private cleanText(value: unknown, max: number): string | null {
    const cleaned = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
    return cleaned ? cleaned.slice(0, max) : null
  }

  private normalized(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  }

  private async indexDocumentParents(companyId: number): Promise<number> {
    const documents = await this.prisma.company_assets.findMany({
      where: { company_id: companyId, indexed_at: null, file_type: 'pdf' },
      orderBy: { created_at: 'asc' },
      take: 20,
    })
    let indexed = 0
    for (const document of documents) {
      const children = await this.prisma.company_assets.findMany({
        where: {
          company_id: companyId,
          source: 'document-extract',
          source_ref: String(document.id),
        },
        select: {
          file_name: true,
          description: true,
          ai_summary: true,
          ai_tags: true,
          indexed_at: true,
        },
      })
      if (children.some(child => !child.indexed_at)) continue
      const childContext = children
        .flatMap(child => [child.ai_summary, child.ai_tags, child.description])
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      const summary = [
        document.description,
        childContext,
        `Document: ${document.file_name}`,
      ]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 4000)
      const tags = this.documentTags(summary)
      await this.prisma.company_assets.update({
        where: { id: document.id },
        data: {
          ai_summary: summary,
          ai_tags: tags.join(', ') || null,
          indexed_at: new Date(),
        },
      })
      indexed++
    }
    return indexed
  }

  private documentTags(value: string): string[] {
    const stopWords = new Set([
      'about',
      'document',
      'from',
      'image',
      'property',
      'that',
      'the',
      'this',
      'with',
    ])
    return [
      ...new Set(
        value
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(token => token.length > 2 && !stopWords.has(token)),
      ),
    ].slice(0, 12)
  }

  private parseIndex(raw: string): { summary: string; tags: string[] } | null {
    try {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      const value = JSON.parse(raw.slice(start, end + 1))
      const summary = String(value.summary || '').trim()
      const tags = Array.isArray(value.tags)
        ? value.tags
            .map((tag: unknown) => String(tag).trim())
            .filter(Boolean)
            .slice(0, 12)
        : []
      return summary ? { summary, tags } : null
    } catch {
      return null
    }
  }

  private urls(value: string | null | undefined): string[] {
    if (!value?.trim()) {
      return []
    }
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(url => /^https:\/\//i.test(url))
      }
    } catch {
      // Non-JSON values are handled by the delimited URL fallback below.
    }
    return value
      .split(/[\n,]+/)
      .map(url => url.trim())
      .filter(url => /^https:\/\//i.test(url))
  }
}
