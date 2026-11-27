import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { GraphApiService } from '../../social/services/graph-api.service'
import { SocialAccountService } from '../../social/services/social-account.service'

type CompanySetting = {
  company_id: number
  target_states: string[]
}

@Injectable()
export class BuyerFinderConnectedSourceService {
  private readonly logger = new Logger(BuyerFinderConnectedSourceService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphApiService,
    private readonly socialAccounts: SocialAccountService,
  ) {}

  async sync(settings: CompanySetting[]) {
    if (!settings.length) return { accounts: 0, companyIds: new Set<number>() }

    const byCompany = new Map(
      settings.map(setting => [setting.company_id, setting]),
    )
    const rows = await this.prisma.social_accounts.findMany({
      where: {
        company_id: { in: settings.map(setting => setting.company_id) },
        platform: { in: ['facebook', 'instagram'] },
        is_active: true,
      },
      orderBy: { id: 'asc' },
    })

    const companyIds = new Set<number>()
    let accounts = 0
    for (const row of rows) {
      const setting = byCompany.get(row.company_id)
      if (!setting) continue

      const expired = Boolean(
        row.token_expires_at && row.token_expires_at.getTime() <= Date.now(),
      )
      const status = expired
        ? 'token_expired'
        : row.last_error?.startsWith('Buyer Finder:')
          ? 'api_error'
          : 'active'
      const externalId =
        row.platform === 'instagram'
          ? row.ig_user_id || row.external_id
          : row.page_id || row.external_id
      const profileUrl = this.profileUrl(row)

      await this.prisma.buyer_finder_accounts.upsert({
        where: {
          platform_external_id: {
            platform: row.platform,
            external_id: externalId,
          },
        },
        create: {
          company_id: row.company_id,
          social_account_id: row.id,
          platform: row.platform,
          external_id: externalId,
          profile_url: profileUrl,
          display_name: row.name,
          handle: row.username,
          states: setting.target_states,
          account_type: 'connected',
          source: 'connected_social',
          status,
        },
        update: {
          company_id: row.company_id,
          social_account_id: row.id,
          profile_url: profileUrl,
          display_name: row.name,
          handle: row.username,
          states: setting.target_states,
          account_type: 'connected',
          source: 'connected_social',
          status,
        },
      })

      accounts += 1
      if (status === 'active') companyIds.add(row.company_id)
    }

    return { accounts, companyIds }
  }

  async status(companyId: number) {
    const accounts = await this.prisma.buyer_finder_accounts.findMany({
      where: { company_id: companyId, source: 'connected_social' },
      select: {
        id: true,
        platform: true,
        display_name: true,
        handle: true,
        status: true,
        last_scanned_at: true,
        social_account: {
          select: {
            id: true,
            token_expires_at: true,
            last_error: true,
            is_active: true,
          },
        },
      },
      orderBy: [{ platform: 'asc' }, { id: 'asc' }],
    })
    return {
      connected_count: accounts.length,
      healthy_count: accounts.filter(account => account.status === 'active')
        .length,
      public_fallback_active: !accounts.some(
        account => account.status === 'active',
      ),
      accounts: accounts.map(account => ({
        id: account.id,
        platform: account.platform,
        name: account.display_name,
        username: account.handle,
        status: account.status,
        last_scanned_at: account.last_scanned_at,
        token_expires_at: account.social_account?.token_expires_at || null,
        error: account.social_account?.last_error || null,
      })),
    }
  }

  async fetchPosts(account: any, maxAgeHours: number) {
    const social = await this.socialAccount(account)
    if (!social) return []
    const token = this.token(social, account.id)
    if (!token) return []
    const since = Math.floor((Date.now() - maxAgeHours * 3_600_000) / 1000)
    const isInstagram = account.platform === 'instagram'
    const objectId = isInstagram
      ? social.ig_user_id || social.external_id
      : social.page_id || social.external_id
    const path = isInstagram
      ? `${objectId}/media`
      : `${objectId}/published_posts`
    const fields = isInstagram
      ? 'id,caption,permalink,timestamp,comments_count'
      : 'id,message,permalink_url,created_time,comments.limit(1).summary(true)'

    return this.getRows(account, social, path, {
      fields,
      since,
      limit: this.limit('BUYER_FINDER_MAX_POSTS_PER_ACCOUNT', 10),
      access_token: token,
    })
  }

  async fetchComments(account: any, postExternalId: string) {
    const social = await this.socialAccount(account)
    if (!social) return []
    const token = this.token(social, account.id)
    if (!token) return []
    const isInstagram = account.platform === 'instagram'
    const fields = isInstagram
      ? 'id,text,timestamp,username,from{id,username}'
      : 'id,message,created_time,from{id,name},permalink_url'

    return this.getRows(account, social, `${postExternalId}/comments`, {
      fields,
      limit: this.limit('BUYER_FINDER_MAX_COMMENTS_PER_POST', 50),
      access_token: token,
    })
  }

  private async getRows(
    account: any,
    social: any,
    path: string,
    params: Record<string, any>,
  ) {
    const result = await this.graph.get(path, params)
    if (!result.success) {
      const reason = result.error || 'Meta Graph API request failed'
      await Promise.all([
        this.prisma.buyer_finder_accounts.update({
          where: { id: account.id },
          data: { status: result.isAuthError ? 'token_error' : 'api_error' },
        }),
        this.socialAccounts.recordError(social.id, `Buyer Finder: ${reason}`),
      ])
      this.logger.warn(
        `Buyer Finder could not read ${account.platform} account ${account.id}: ${reason}`,
      )
      return []
    }

    await Promise.all([
      this.prisma.buyer_finder_accounts.update({
        where: { id: account.id },
        data: { status: 'active' },
      }),
      this.socialAccounts.clearError(social.id),
    ])
    return Array.isArray(result.data?.data) ? result.data.data : []
  }

  private async socialAccount(account: any) {
    if (!account.social_account_id) return null
    const social = await this.prisma.social_accounts.findUnique({
      where: { id: account.social_account_id },
    })
    if (!social?.is_active) return null
    if (
      social.token_expires_at &&
      social.token_expires_at.getTime() <= Date.now()
    ) {
      await this.prisma.buyer_finder_accounts.update({
        where: { id: account.id },
        data: { status: 'token_expired' },
      })
      return null
    }
    return social
  }

  private token(social: any, buyerFinderAccountId: number) {
    try {
      return this.socialAccounts.token(social)
    } catch (error) {
      this.logger.error(
        `Could not decrypt social token for Buyer Finder account ${buyerFinderAccountId}`,
        error instanceof Error ? error.message : String(error),
      )
      return null
    }
  }

  private profileUrl(account: any) {
    if (account.platform === 'instagram') {
      return account.username
        ? `https://instagram.com/${account.username}`
        : 'https://instagram.com/'
    }
    return `https://facebook.com/${account.page_id || account.external_id}`
  }

  private limit(key: string, fallback: number) {
    const value = Number(process.env[key])
    return Number.isFinite(value) && value > 0 ? value : fallback
  }
}
