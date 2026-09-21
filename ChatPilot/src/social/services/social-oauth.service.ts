import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { socialConfig } from '../social.config'
import { SOCIAL_PLATFORM } from '../constants/social.constants'
import { GraphApiService } from './graph-api.service'
import { SocialAccountService } from './social-account.service'

const STATE_TTL_MS = 10 * 60 * 1000

const SCOPES = [
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_engagement',
  'pages_manage_metadata',
  'pages_manage_posts',
  'pages_messaging',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_messages',
].join(',')

@Injectable()
export class SocialOauthService {
  private readonly logger = new Logger(SocialOauthService.name)

  constructor(
    private readonly graph: GraphApiService,
    private readonly socialAccountService: SocialAccountService,
  ) {}

  buildAuthorizeUrl(companyId: number, userId: number): string {
    this.assertConfigured()

    const state = this.signState({
      companyId,
      userId,
      nonce: randomBytes(8).toString('hex'),
      exp: Date.now() + STATE_TTL_MS,
    })

    const params = new URLSearchParams({
      client_id: socialConfig.appId,
      redirect_uri: socialConfig.oauthRedirectUri,
      response_type: 'code',
      override_default_response_type: 'true',
      state,
      config_id: socialConfig.loginConfigId,
    })

    return `https://www.facebook.com/${socialConfig.graphVersion}/dialog/oauth?${params.toString()}`
  }

  async completeCallback(code: string, state: string) {
    this.assertConfigured()

    const payload = this.verifyState(state)

    const shortLived = await this.graph.exchangeCodeForToken(code)
    if (!shortLived.success || !shortLived.data?.access_token) {
      throw new BadRequestException('Failed to exchange authorization code')
    }

    const longLived = await this.graph.exchangeForLongLivedToken(
      shortLived.data.access_token,
    )
    if (!longLived.success || !longLived.data?.access_token) {
      throw new BadRequestException('Failed to obtain a long-lived token')
    }

    const pages = await this.graph.listPages(longLived.data.access_token)
    if (!pages.success) {
      throw new BadRequestException('Failed to list Facebook pages')
    }

    const connected: string[] = []

    for (const page of pages.data?.data ?? []) {
      if (!page?.id || !page?.access_token) continue

      const account = await this.socialAccountService.upsert({
        companyId: payload.companyId,
        platform: SOCIAL_PLATFORM.FACEBOOK,
        externalId: page.id,
        pageId: page.id,
        name: page.name ?? null,
        accessToken: page.access_token,
        scopes: SCOPES,
      })

      const subscribed = await this.graph.subscribePage(
        page.id,
        page.access_token,
      )
      if (subscribed.success) {
        await this.socialAccountService.markSubscribed(account.id)
      } else {
        await this.socialAccountService.recordError(
          account.id,
          subscribed.error ?? 'subscribe failed',
        )
      }

      connected.push(`facebook:${page.id}`)

      const ig = page.instagram_business_account
      if (ig?.id) {
        const igAccount = await this.socialAccountService.upsert({
          companyId: payload.companyId,
          platform: SOCIAL_PLATFORM.INSTAGRAM,
          externalId: ig.id,
          pageId: page.id,
          igUserId: ig.id,
          name: page.name ?? null,
          username: ig.username ?? null,
          accessToken: page.access_token,
          scopes: SCOPES,
        })

        if (subscribed.success) {
          await this.socialAccountService.markSubscribed(igAccount.id)
        }
        connected.push(`instagram:${ig.id}`)
      }
    }

    if (!connected.length) {
      throw new BadRequestException(
        'No Facebook pages were returned for this account',
      )
    }

    return { companyId: payload.companyId, connected }
  }

  private assertConfigured() {
    if (
      !socialConfig.appId ||
      !socialConfig.appSecret ||
      !socialConfig.oauthRedirectUri ||
      !socialConfig.loginConfigId
    ) {
      throw new BadRequestException(
        'meta not configured: Facebook Login for Business configuration is required',
      )
    }
  }

  private signState(payload: {
    companyId: number
    userId: number
    nonce: string
    exp: number
  }): string {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new BadRequestException('server not configured')

    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = createHmac('sha256', secret)
      .update(body)
      .digest('base64url')
    return `${body}.${signature}`
  }

  private verifyState(state: string): {
    companyId: number
    userId: number
    exp: number
  } {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new BadRequestException('server not configured')

    const [body, signature] = (state || '').split('.')
    if (!body || !signature) throw new BadRequestException('invalid state')

    const expected = createHmac('sha256', secret)
      .update(body)
      .digest('base64url')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('invalid state')
    }

    try {
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      )
      if (!payload?.exp || payload.exp < Date.now()) {
        throw new BadRequestException('state expired')
      }
      return payload
    } catch {
      throw new BadRequestException('invalid state')
    }
  }
}
