import { createHash } from 'crypto'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { AiRoutingService } from '../../ai-routing/ai-routing.service'
import { AiWorkload } from '../../ai-routing/ai-routing.types'
import { runActor } from '../../leads/scrapers/apify-client'
import { scraperConfig } from '../../leads/scrapers/scraper-config'
import { extractPhone, normalizeNgPhone } from '../../leads/scrapers/extract'
import { parseState } from '../../leads/scrapers/location'
import { buyerFinderPublicDiscoveryEnabled } from '../buyer-finder.constants'
import { BuyerFinderConnectedSourceService } from './buyer-finder-connected-source.service'

type JsonRow = Record<string, any>

@Injectable()
export class BuyerFinderIngestionService {
  private readonly logger = new Logger(BuyerFinderIngestionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouting: AiRoutingService,
    private readonly connectedSource: BuyerFinderConnectedSourceService,
  ) {}

  async discover(): Promise<{
    states: number
    accounts: number
    connectedAccounts: number
    publicFallback: boolean
  }> {
    const settings = await this.prisma.buyer_finder_settings.findMany({
      where: { enabled: true },
      select: { id: true, company_id: true, target_states: true },
    })
    const connected = await this.connectedSource.sync(settings)
    const fallbackSettings = settings.filter(
      setting => !connected.companyIds.has(setting.company_id),
    )
    const states = [
      ...new Set(fallbackSettings.flatMap(row => row.target_states)),
    ]
    let accounts = connected.accounts
    if (buyerFinderPublicDiscoveryEnabled()) {
      for (const state of states) {
        accounts += await this.discoverInstagram(state)
        accounts += await this.discoverFacebook(state)
      }
    }
    if (settings.length) {
      await this.prisma.buyer_finder_settings.updateMany({
        where: { id: { in: settings.map(row => row.id) } },
        data: { last_discovery_at: new Date() },
      })
    }
    return {
      states: states.length,
      accounts,
      connectedAccounts: connected.accounts,
      publicFallback: buyerFinderPublicDiscoveryEnabled(),
    }
  }

  async scan(): Promise<{
    accounts: number
    posts: number
    commentIds: number[]
  }> {
    const settings = await this.prisma.buyer_finder_settings.findMany({
      where: { enabled: true },
      select: {
        id: true,
        company_id: true,
        target_states: true,
        post_max_age_hours: true,
        min_post_comments: true,
      },
    })
    if (!settings.length) return { accounts: 0, posts: 0, commentIds: [] }
    const connected = await this.connectedSource.sync(settings)
    const fallbackCompanyIds = settings
      .filter(setting => !connected.companyIds.has(setting.company_id))
      .map(setting => setting.company_id)
    const states = [...new Set(settings.flatMap(row => row.target_states))]
    const maxAgeHours = Math.min(...settings.map(row => row.post_max_age_hours))
    const minComments = Math.min(...settings.map(row => row.min_post_comments))
    const accounts = await this.prisma.buyer_finder_accounts.findMany({
      where: {
        status: 'active',
        OR: [
          {
            source: 'connected_social',
            company_id: { in: settings.map(setting => setting.company_id) },
          },
          ...(buyerFinderPublicDiscoveryEnabled() && fallbackCompanyIds.length
            ? [{ source: 'public', states: { hasSome: states } }]
            : []),
        ],
      },
      orderBy: [{ last_scanned_at: 'asc' }, { id: 'asc' }],
    })
    const commentIds: number[] = []
    let posts = 0
    for (const account of accounts) {
      const postRows = await this.fetchPosts(account, maxAgeHours)
      for (const item of postRows) {
        const normalized = this.normalizePost(
          item,
          account.platform,
          maxAgeHours,
        )
        if (!normalized || normalized.commentCount < minComments) continue
        const post = await this.prisma.buyer_finder_posts.upsert({
          where: {
            platform_external_id: {
              platform: account.platform,
              external_id: normalized.externalId,
            },
          },
          create: {
            account_id: account.id,
            platform: account.platform,
            external_id: normalized.externalId,
            post_url: normalized.url,
            caption: normalized.caption,
            published_at: normalized.publishedAt,
            comment_count: normalized.commentCount,
            eligible_until: normalized.eligibleUntil,
            raw_payload: item as any,
          },
          update: {
            account_id: account.id,
            post_url: normalized.url,
            caption: normalized.caption,
            published_at: normalized.publishedAt,
            comment_count: normalized.commentCount,
            eligible_until: normalized.eligibleUntil,
            raw_payload: item as any,
          },
        })
        posts += 1
        if (post.context_status !== 'ready') {
          await this.enrichPostContext(post.id)
        }
        const comments = await this.fetchComments(account, {
          url: post.post_url,
          externalId: normalized.rawExternalId,
        })
        for (const raw of comments) {
          const value = this.normalizeComment(raw, account.platform)
          if (!value) continue
          if (value.authorExternalId === account.external_id) continue
          const saved = await this.prisma.buyer_finder_comments.upsert({
            where: {
              platform_external_id: {
                platform: account.platform,
                external_id: value.externalId,
              },
            },
            create: {
              post_id: post.id,
              platform: account.platform,
              external_id: value.externalId,
              author_external_id: value.authorExternalId,
              author_name: value.authorName,
              author_handle: value.authorHandle,
              author_profile_url: value.authorProfileUrl,
              author_bio: value.authorBio,
              comment_text: value.text,
              phone_normalized: value.phone,
              commented_at: value.commentedAt,
              raw_payload: raw as any,
            },
            update: {
              author_name: value.authorName,
              author_handle: value.authorHandle,
              author_profile_url: value.authorProfileUrl,
              author_bio: value.authorBio,
              comment_text: value.text,
              phone_normalized: value.phone,
              commented_at: value.commentedAt,
              raw_payload: raw as any,
            },
          })
          if (saved.status === 'pending') commentIds.push(saved.id)
        }
        await this.prisma.buyer_finder_posts.update({
          where: { id: post.id },
          data: { last_comments_scan_at: new Date() },
        })
      }
      await this.prisma.buyer_finder_accounts.update({
        where: { id: account.id },
        data: { last_scanned_at: new Date() },
      })
    }
    await this.prisma.buyer_finder_settings.updateMany({
      where: { id: { in: settings.map(row => row.id) } },
      data: { last_scan_at: new Date() },
    })
    return {
      accounts: accounts.length,
      posts,
      commentIds: [...new Set(commentIds)],
    }
  }

  private async discoverInstagram(state: string) {
    const rows = await runActor<JsonRow>(scraperConfig.apify.instagramActor, {
      search: `${state} real estate`,
      searchType: 'user',
      resultsType: 'details',
      searchLimit: scraperConfig.apify.buyerFinderMaxAccountsPerState,
      resultsLimit: scraperConfig.apify.buyerFinderMaxAccountsPerState,
      addParentData: false,
    })
    let saved = 0
    for (const row of rows) {
      const followers = this.number(
        row.followersCount,
        row.followers,
        row.edge_followed_by?.count,
      )
      const externalId = this.string(row.id, row.username)
      const url = this.string(
        row.url,
        row.profileUrl,
        row.username && `https://instagram.com/${row.username}`,
      )
      if (!externalId || !url || followers < 3000) continue
      await this.saveAccount({
        platform: 'instagram',
        externalId,
        url,
        state,
        followers,
        row,
      })
      saved += 1
    }
    return saved
  }

  private async discoverFacebook(state: string) {
    const searchQueries = [
      `${state} Real Estate`,
      `${state} Properties`,
      `${state} Land for Sale`,
    ]
    const rows = await runActor<JsonRow>(scraperConfig.apify.fbSearchActor, {
      searchQueries,
      maxPages: scraperConfig.apify.buyerFinderMaxAccountsPerState,
      maxResults: scraperConfig.apify.buyerFinderMaxAccountsPerState,
    })
    let saved = 0
    for (const row of rows) {
      const followers = this.number(
        row.followers,
        row.followersCount,
        row.likes,
        row.likesCount,
      )
      const externalId = this.string(
        row.id,
        row.pageId,
        row.url,
        row.facebookUrl,
      )
      const url = this.string(row.url, row.facebookUrl, row.pageUrl)
      const accountType = String(row.type || row.category || '').toLowerCase()
      const publicGroup =
        accountType.includes('group') && row.isPublic !== false
      if (!externalId || !url || (!publicGroup && followers < 3000)) continue
      await this.saveAccount({
        platform: 'facebook',
        externalId,
        url,
        state,
        followers,
        row,
      })
      saved += 1
    }
    return saved
  }

  private async saveAccount(input: {
    platform: string
    externalId: string
    url: string
    state: string
    followers: number
    row: JsonRow
  }) {
    const existing = await this.prisma.buyer_finder_accounts.findUnique({
      where: {
        platform_external_id: {
          platform: input.platform,
          external_id: input.externalId,
        },
      },
    })
    const states = [...new Set([...(existing?.states || []), input.state])]
    return this.prisma.buyer_finder_accounts.upsert({
      where: {
        platform_external_id: {
          platform: input.platform,
          external_id: input.externalId,
        },
      },
      create: {
        platform: input.platform,
        external_id: input.externalId,
        profile_url: input.url,
        display_name: this.string(
          input.row.name,
          input.row.fullName,
          input.row.title,
        ),
        handle: this.string(input.row.username, input.row.handle),
        states,
        follower_count: input.followers,
        account_type: this.string(input.row.type, input.row.category),
      },
      update: {
        profile_url: input.url,
        display_name: this.string(
          input.row.name,
          input.row.fullName,
          input.row.title,
        ),
        handle: this.string(input.row.username, input.row.handle),
        states,
        follower_count: input.followers,
        account_type: this.string(input.row.type, input.row.category),
        status: 'active',
      },
    })
  }

  private fetchPosts(account: any, maxAgeHours: number) {
    if (account.source === 'connected_social') {
      return this.connectedSource.fetchPosts(account, maxAgeHours)
    }
    if (account.platform === 'instagram') {
      return runActor<JsonRow>(scraperConfig.apify.instagramActor, {
        directUrls: [account.profile_url],
        resultsType: 'posts',
        resultsLimit: scraperConfig.apify.buyerFinderMaxPostsPerAccount,
        onlyPostsNewerThan: `${maxAgeHours} hours`,
        skipPinnedPosts: true,
      })
    }
    return runActor<JsonRow>(scraperConfig.apify.postsActor, {
      startUrls: [{ url: account.profile_url }],
      resultsLimit: scraperConfig.apify.buyerFinderMaxPostsPerAccount,
      maxPosts: scraperConfig.apify.buyerFinderMaxPostsPerAccount,
      onlyPostsNewerThan: `${maxAgeHours} hours`,
    })
  }

  private fetchComments(
    account: any,
    post: { url: string; externalId: string },
  ) {
    if (account.source === 'connected_social') {
      return this.connectedSource.fetchComments(account, post.externalId)
    }
    if (account.platform === 'instagram') {
      return runActor<JsonRow>(scraperConfig.apify.instagramActor, {
        directUrls: [post.url],
        resultsType: 'comments',
        resultsLimit: scraperConfig.apify.buyerFinderMaxCommentsPerPost,
        isNewestComments: true,
      })
    }
    return runActor<JsonRow>(scraperConfig.apify.fbCommentsActor, {
      startUrls: [{ url: post.url }],
      resultsLimit: scraperConfig.apify.buyerFinderMaxCommentsPerPost,
      onlyCommentsNewerThan: '2 days',
      includeNestedComments: false,
    })
  }

  private normalizePost(row: JsonRow, platform: string, maxAgeHours: number) {
    const url = this.string(
      row.url,
      row.postUrl,
      row.facebookUrl,
      row.displayUrl,
      row.permalink,
      row.permalink_url,
    )
    const externalId = this.string(row.id, row.postId, row.shortCode, url)
    if (!url || !externalId) return null
    const publishedAt = this.date(
      row.timestamp,
      row.takenAt,
      row.time,
      row.createdAt,
      row.created_time,
    )
    if (
      publishedAt &&
      publishedAt.getTime() < Date.now() - maxAgeHours * 3_600_000
    ) {
      return null
    }
    return {
      rawExternalId: externalId,
      externalId: `${platform}-${externalId}`,
      url,
      caption: this.string(row.caption, row.text, row.message, row.description),
      publishedAt,
      commentCount: this.number(
        row.commentsCount,
        row.commentCount,
        row.comments_count,
        row.comments?.summary?.total_count,
        row.comments?.length,
      ),
      eligibleUntil: publishedAt
        ? new Date(publishedAt.getTime() + maxAgeHours * 3_600_000)
        : new Date(Date.now() + maxAgeHours * 3_600_000),
    }
  }

  private normalizeComment(row: JsonRow, platform: string) {
    const text = this.string(row.text, row.commentText, row.message)
    if (!text) return null
    const owner = row.owner || row.user || row.author || row.from || {}
    const authorHandle = this.string(
      owner.username,
      row.username,
      row.authorUsername,
    )
    const authorExternalId = this.string(
      owner.id,
      row.authorId,
      row.userId,
      authorHandle,
    )
    const rawId = this.string(row.id, row.commentId, row.url)
    const externalId =
      rawId ||
      createHash('sha256')
        .update(`${platform}|${authorExternalId || ''}|${text}`)
        .digest('hex')
    const phoneText = extractPhone(
      text,
      this.string(owner.biography, row.authorBio) || '',
    )
    const normalizedPhone = normalizeNgPhone(phoneText)
    return {
      externalId: `${platform}-${externalId}`,
      authorExternalId,
      authorName: this.string(owner.fullName, owner.name, row.authorName),
      authorHandle,
      authorProfileUrl: this.string(
        owner.profileUrl,
        row.profileUrl,
        row.authorProfileUrl,
      ),
      authorBio: this.string(owner.biography, row.authorBio),
      text,
      phone: normalizedPhone
        ? BigInt(normalizedPhone.replace(/\D/g, ''))
        : null,
      commentedAt: this.date(row.timestamp, row.createdAt, row.time),
    }
  }

  private async enrichPostContext(postId: number) {
    const post = await this.prisma.buyer_finder_posts.findUnique({
      where: { id: postId },
    })
    if (!post) return
    const fallbackState = parseState(post.caption || '')
    const propertyMatch = (post.caption || '').match(
      /\b(\d+[- ]?bedroom\s+)?(duplex|bungalow|apartment|flat|terrace|land|plot|house|office|shop|warehouse)\b/i,
    )
    let propertyType = propertyMatch?.[0] || null
    let location = fallbackState
    try {
      const result = await this.aiRouting.generate({
        workload: AiWorkload.BuyerFinder,
        routingKey: `buyer-finder-post:${post.platform}:${post.external_id}`,
        temperature: 0,
        maxOutputTokens: 120,
        system:
          'Extract real-estate context. Return strict JSON only: {"property_type":string|null,"specific_location":string|null}. Never invent missing details.',
        prompt: (post.caption || '').slice(0, 1500),
      })
      const start = result.text.indexOf('{')
      const end = result.text.lastIndexOf('}')
      if (start >= 0 && end > start) {
        const value = JSON.parse(result.text.slice(start, end + 1))
        propertyType = String(value.property_type || '').trim() || propertyType
        location = String(value.specific_location || '').trim() || location
      }
    } catch {
      this.logger.debug(`Using deterministic context for post ${post.id}`)
    }
    await this.prisma.buyer_finder_posts.update({
      where: { id: post.id },
      data: {
        property_type: propertyType,
        specific_location: location,
        context_status: 'ready',
      },
    })
  }

  private string(...values: any[]): string | null {
    const value = values.find(item => typeof item === 'string' && item.trim())
    return value ? value.trim() : null
  }

  private number(...values: any[]): number {
    const value = values.find(item => Number.isFinite(Number(item)))
    return value === undefined ? 0 : Number(value)
  }

  private date(...values: any[]): Date | null {
    for (const value of values) {
      if (!value) continue
      const parsed = new Date(
        typeof value === 'number' && value < 10_000_000_000
          ? value * 1000
          : value,
      )
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return null
  }
}
