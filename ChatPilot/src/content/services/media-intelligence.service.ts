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
  image_indices?: number[] | null
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
    const mediaHistory = await this.prisma.content_posts.findMany({
      where: {
        company_id: companyId,
        image_urls: { not: null },
      },
      orderBy: { created_at: 'desc' },
      take: 2000,
      select: { image_urls: true, created_at: true },
    })
    const lastUsedByUrl = new Map<string, Date>()
    for (const row of mediaHistory) {
      for (const url of this.urls(row.image_urls)) {
        if (!lastUsedByUrl.has(url)) lastUsedByUrl.set(url, row.created_at)
      }
    }
    const recentlyUsed = new Set(
      [...lastUsedByUrl.entries()]
        .filter(([, usedAt]) => usedAt.getTime() >= cutoff.getTime())
        .map(([url]) => url),
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
      const recordedUse = lastUsedByUrl.get(item.url)
      if (!recordedUse) {
        score += 40
      } else {
        score += Math.min(
          40,
          Math.max(0, (Date.now() - recordedUse.getTime()) / 86400000),
        )
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
      score += Math.random() * 2
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
    const documentImages = await this.prisma.company_assets.findMany({
      where: {
        company_id: document.company_id,
        source: 'document-extract',
        source_ref: String(document.id),
        file_type: 'image',
      },
      orderBy: { created_at: 'asc' },
      take: 8,
    })

    // Cloudflare Workers AI does not accept application/pdf file parts. For
    // scanned brochures, use the page/embedded images extracted at upload
    // time. If neither text nor images are available, finish cleanly instead
    // of repeatedly sending an unsupported raw PDF every hour.
    if (!documentText && !documentImages.length) {
      await this.completeDocumentIndex(document, 0, notify)
      return 0
    }

    const result = await this.aiRouting.generate({
      workload: documentImages.length
        ? AiWorkload.MediaIndex
        : AiWorkload.Content,
      companyId: document.company_id,
      system:
        'Extract only explicitly stated real-estate listings from the supplied brochure text and numbered images. Never infer or invent a price, location, title document, availability, room count, feature, or image relationship. Return strict JSON only: {"properties":[{"title":"","description":null,"property_type":null,"location":null,"state":null,"price":null,"price_max":null,"currency":"NGN","size_sqm":null,"bedrooms":null,"bathrooms":null,"title_document":null,"payment_plan":null,"features":null,"status":"available|reserved|sold|hidden","image_indices":[1]}]}. image_indices must contain only the 1-based numbers of images that visibly belong to that exact listing. Do not assign logos, generic covers, maps, or another listing\'s picture. Leave image_indices empty when uncertain. Use numeric naira values without commas. Omit brochures that contain no identifiable property listings by returning an empty properties array. Keep each description factual and under 600 characters.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract the distinct property listings in ${document.file_name}. Existing description: ${document.description || 'none'}${documentText ? `\n\nPDF text:\n${documentText}` : ''}\n\n${documentImages.length ? `There are ${documentImages.length} numbered extracted images below. Map each listing only to its own images.` : 'No extracted images are available.'}`,
            },
            ...documentImages.flatMap((asset, index) => [
              {
                type: 'text' as const,
                text: `Image ${index + 1}: ${asset.file_name}`,
              },
              {
                type: 'file' as const,
                data: new URL(asset.file_url),
                mediaType: asset.mime_type || 'image/jpeg',
              },
            ]),
          ],
        },
      ],
      maxOutputTokens: 2200,
      temperature: 0.1,
    })
    const extracted = this.parseDocumentProperties(result.text)
    const saved = await this.saveDocumentProperties(document, extracted)
    await this.reconcileCompanyProperties(document.company_id)
    await this.completeDocumentIndex(document, saved, notify)
    return saved
  }

  private async completeDocumentIndex(
    document: {
      id: number
      company_id: number
      file_name: string
    },
    saved: number,
    notify: boolean,
  ): Promise<void> {
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
      const fingerprint = this.propertyFingerprint({
        ...property,
        title,
        location,
      })
      const duplicate = current.find(item =>
        this.isDuplicateProperty(item, { ...property, title, location }),
      )
      const images = this.imagesForExtractedProperty(
        property,
        children,
      )
      if (duplicate) {
        const sameDocument = duplicate.source_asset_id === document.id
        const mergedImages = sameDocument
          ? images
          : [...new Set([...this.urls(duplicate.image_urls), ...images])]
        await this.prisma.properties.update({
          where: { id: duplicate.id },
          data: {
            description: this.richerText(
              duplicate.description,
              this.cleanText(property.description, 3000),
            ),
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
              : sameDocument
                ? null
                : duplicate.image_urls,
            source_fingerprint: duplicate.source_fingerprint || fingerprint,
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

  private imagesForExtractedProperty(
    property: ExtractedProperty,
    children: Array<{
      file_url: string
      file_name: string
      description: string | null
      ai_summary: string | null
      ai_tags: string | null
    }>,
  ): string[] {
    const explicit = Array.isArray(property.image_indices)
      ? [
          ...new Set(
            property.image_indices
              .map(value => Math.floor(Number(value)))
              .filter(value => value >= 1 && value <= children.length),
          ),
        ].map(value => children[value - 1].file_url)
      : []
    if (explicit.length) return explicit
    const genericTokens = new Set([
      'apartment',
      'bedroom',
      'brochure',
      'detached',
      'duplex',
      'fully',
      'house',
      'image',
      'property',
    ])
    const tokens = new Set(
      [property.title, property.location, property.property_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 3 && !genericTokens.has(token)),
    )
    const scored = children
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
      .sort((a, b) => b.score - a.score)
    const bestScore = scored[0]?.score || 0
    const matched = scored
      .filter(item => bestScore >= 2 && item.score === bestScore)
      .map(item => item.url)
    if (matched.length) return matched

    // PDF object order is not reliably page order. If neither the model nor
    // indexed media metadata establishes the relationship, keep the image
    // unassigned rather than coupling a listing to the wrong photograph.
    return []
  }

  async reconcileCompanyProperties(companyId: number): Promise<number> {
    const properties = await this.prisma.properties.findMany({
      where: { company_id: companyId },
      orderBy: { id: 'asc' },
    })
    const keepers: typeof properties = []
    let removed = 0

    for (const candidate of properties) {
      const keeper = keepers.find(item =>
        this.isDuplicateProperty(item, candidate),
      )
      if (!keeper) {
        keepers.push(candidate)
        continue
      }

      const mergedImages = [
        ...new Set([
          ...this.urls(keeper.image_urls),
          ...this.urls(candidate.image_urls),
        ]),
      ].slice(0, 10)
      const merged = {
        description: this.richerText(keeper.description, candidate.description),
        property_type: keeper.property_type || candidate.property_type,
        location: keeper.location || candidate.location,
        state: keeper.state || candidate.state,
        price: keeper.price || candidate.price,
        price_max: keeper.price_max || candidate.price_max,
        size_sqm: keeper.size_sqm || candidate.size_sqm,
        bedrooms: keeper.bedrooms || candidate.bedrooms,
        bathrooms: keeper.bathrooms || candidate.bathrooms,
        title_document: keeper.title_document || candidate.title_document,
        payment_plan: this.richerText(
          keeper.payment_plan,
          candidate.payment_plan,
        ),
        features: this.richerText(keeper.features, candidate.features),
        image_urls: mergedImages.length ? mergedImages.join(',') : null,
        video_url: keeper.video_url || candidate.video_url,
        source_fingerprint:
          keeper.source_fingerprint ||
          candidate.source_fingerprint ||
          this.propertyFingerprint(keeper),
      }

      await this.prisma.$transaction([
        this.prisma.content_posts.updateMany({
          where: { property_id: candidate.id },
          data: { property_id: keeper.id },
        }),
        this.prisma.properties.update({
          where: { id: keeper.id },
          data: merged,
        }),
        this.prisma.properties.delete({ where: { id: candidate.id } }),
      ])
      Object.assign(keeper, merged)
      removed++
    }
    return removed
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
      if (text.length < 40) return null
      return this.samplePdfText(text, 12_000)
    } catch (error) {
      this.logger.warn(`Local PDF text extraction failed: ${error?.message}`)
      return null
    }
  }

  private samplePdfText(text: string, limit: number): string {
    if (text.length <= limit) return text
    const sampleSize = Math.floor(limit / 3)
    const middleStart = Math.max(
      0,
      Math.floor(text.length / 2 - sampleSize / 2),
    )
    return [
      text.slice(0, sampleSize),
      text.slice(middleStart, middleStart + sampleSize),
      text.slice(-sampleSize),
    ].join('\n\n[document section omitted]\n\n')
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

  private propertyFingerprint(value: any): string | null {
    const facts = [
      this.normalized(String(value.location || '')),
      this.normalized(String(value.property_type || '')),
      value.bedrooms == null ? '' : String(value.bedrooms),
      value.price == null ? '' : String(value.price),
      value.size_sqm == null ? '' : String(value.size_sqm),
      this.normalized(String(value.title_document || '')),
    ]
    // A generic title alone is not an identity. Requiring corroborating facts
    // prevents unrelated "Duplex" or "Land" listings from being collapsed.
    if (facts.filter(Boolean).length < 2) return null
    const identity = [
      this.normalized(String(value.title || '')),
      ...facts,
    ].join('|')
    return createHash('sha256').update(identity).digest('hex')
  }

  private isDuplicateProperty(left: any, right: any): boolean {
    if (
      left.source_fingerprint &&
      right.source_fingerprint &&
      left.source_fingerprint === right.source_fingerprint
    ) {
      return true
    }

    const leftTitle = this.normalized(String(left.title || ''))
    const rightTitle = this.normalized(String(right.title || ''))
    if (!leftTitle || !rightTitle) return false
    const leftLocation = this.normalized(String(left.location || ''))
    const rightLocation = this.normalized(String(right.location || ''))
    const locationMatches =
      leftLocation && rightLocation ? leftLocation === rightLocation : undefined
    const priceMatches = this.numericFactMatches(left.price, right.price, 0.05)
    const bedroomMatches = this.numericFactMatches(
      left.bedrooms,
      right.bedrooms,
    )
    const sizeMatches = this.numericFactMatches(
      left.size_sqm,
      right.size_sqm,
      0.02,
    )
    const typeMatches = this.textFactMatches(
      left.property_type,
      right.property_type,
    )

    const exactTitleEvidence = [
      locationMatches,
      priceMatches,
      bedroomMatches,
      sizeMatches,
      typeMatches,
    ].filter(value => value === true).length
    const exactTitleConflict = [
      locationMatches,
      priceMatches,
      bedroomMatches,
      sizeMatches,
      typeMatches,
    ].some(value => value === false)
    if (
      leftTitle === rightTitle &&
      !exactTitleConflict &&
      (locationMatches === true ||
        priceMatches === true ||
        exactTitleEvidence >= 2)
    ) {
      return true
    }

    const comparableMatches = [
      leftLocation && rightLocation
        ? leftLocation === rightLocation
        : undefined,
      priceMatches,
      bedroomMatches,
      sizeMatches,
      typeMatches,
    ].filter(value => value !== undefined)
    const matches = comparableMatches.filter(Boolean).length
    const conflicts = comparableMatches.filter(value => value === false).length
    return (
      conflicts === 0 &&
      matches >= 3 &&
      this.tokenSimilarity(leftTitle, rightTitle) >= 0.5
    )
  }

  private numericFactMatches(
    left: unknown,
    right: unknown,
    tolerance = 0,
  ): boolean | undefined {
    if (left == null || right == null || left === '' || right === '') {
      return undefined
    }
    const a = Number(left)
    const b = Number(right)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined
    if (!tolerance) return a === b
    return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * tolerance
  }

  private textFactMatches(left: unknown, right: unknown): boolean | undefined {
    const a = this.normalized(String(left || ''))
    const b = this.normalized(String(right || ''))
    return a && b ? a === b : undefined
  }

  private tokenSimilarity(left: string, right: string): number {
    const ignored = new Set([
      'available',
      'beautiful',
      'brand',
      'for',
      'luxury',
      'new',
      'property',
      'sale',
    ])
    const a = new Set(left.split(' ').filter(token => !ignored.has(token)))
    const b = new Set(right.split(' ').filter(token => !ignored.has(token)))
    const union = new Set([...a, ...b])
    if (!union.size) return 0
    const intersection = [...a].filter(token => b.has(token)).length
    return intersection / union.size
  }

  private richerText(
    current: string | null | undefined,
    incoming: string | null | undefined,
  ): string | null {
    const first = current?.trim() || ''
    const second = incoming?.trim() || ''
    return (second.length > first.length ? second : first) || null
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
