import { Injectable, Logger } from '@nestjs/common'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import { PrismaService } from 'src/prisma/prisma.service'
import { decryptMessage } from 'src/common/crypto/message-crypto'
import { socialConfig } from '../social.config'
import {
  COMMENT_REPLY_TEMPLATES,
  DM_REPLY_TEMPLATE,
  SOCIAL_ACTION,
  SOCIAL_EVENT_TYPE,
  SOCIAL_PLATFORM,
} from '../constants/social.constants'
import { GraphApiService } from './graph-api.service'
import { IntentClassifierService } from './intent-classifier.service'
import { SocialAccountService } from './social-account.service'
import { WaLinkService } from './wa-link.service'
import { SOCIAL_REPLY_SYSTEM_PROMPT } from '../constants/social-reply-prompt'

@Injectable()
export class SocialReplyService {
  private readonly logger = new Logger(SocialReplyService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly socialAccountService: SocialAccountService,
    private readonly intentClassifier: IntentClassifierService,
    private readonly waLink: WaLinkService,
    private readonly graph: GraphApiService,
  ) {}

  async handleEvent(eventId: number): Promise<string> {
    const event = await this.prisma.social_events.findUnique({
      where: { id: eventId },
    })

    if (!event) return 'not_found'
    if (event.action !== SOCIAL_ACTION.RECEIVED) return 'already_processed'
    if (!event.social_account_id) return SOCIAL_ACTION.UNKNOWN_ACCOUNT

    const account = await this.prisma.social_accounts.findUnique({
      where: { id: event.social_account_id },
      include: { company: true },
    })

    if (!account || !account.is_active || !account.company) {
      return this.finish(eventId, SOCIAL_ACTION.UNKNOWN_ACCOUNT, {})
    }

    const company = account.company

    const plainText = decryptMessage(event.text ?? '')

    const verdict = await this.intentClassifier.classify({
      id: event.id,
      text: plainText,
      post_id: event.post_id,
      external_user_id: event.external_user_id,
      social_account_id: event.social_account_id,
    })

    if (!verdict.shouldReply) {
      return this.finish(eventId, SOCIAL_ACTION.SKIPPED_LOW_INTENT, {
        intent: verdict.intent,
        intent_score: verdict.score,
        classifier: verdict.classifier,
      })
    }

    const isInstagramComment =
      event.platform === SOCIAL_PLATFORM.INSTAGRAM &&
      event.event_type === SOCIAL_EVENT_TYPE.COMMENT
    const refCode = isInstagramComment ? null : this.waLink.generateRefCode()
    const waLink = refCode
      ? this.waLink.build(company, event.platform, refCode)
      : null

    if (!isInstagramComment && !waLink) {
      this.logger.error(
        `Company ${company.id} has no usable WhatsApp number for wa.me links`,
      )
      return this.finish(eventId, SOCIAL_ACTION.SKIPPED_BAD_PHONE, {
        intent: verdict.intent,
        intent_score: verdict.score,
        classifier: verdict.classifier,
      })
    }

    const context = await this.replyContext(event.content_post_id)
    const replyText = await this.buildReplyText({
      eventType: event.event_type,
      platform: event.platform,
      eventId: event.id,
      authorName: event.external_user_name,
      message: plainText,
      companyName: company.name,
      companyProfile: this.companyProfile(company.business_details),
      waLink,
      context,
    })

    if (!socialConfig.replyEnabled || company.social_reply_enabled === false) {
      return this.finish(eventId, SOCIAL_ACTION.SKIPPED_DISABLED, {
        intent: verdict.intent,
        intent_score: verdict.score,
        classifier: verdict.classifier,
        reply_text: replyText,
        wa_link: waLink,
        ref_code: refCode,
      })
    }

    if (await this.isRateLimited(account.id)) {
      return this.finish(eventId, SOCIAL_ACTION.SKIPPED_RATE_LIMITED, {
        intent: verdict.intent,
        intent_score: verdict.score,
        classifier: verdict.classifier,
        wa_link: waLink,
      })
    }

    const token = this.socialAccountService.token(account)
    const result = await this.dispatch(event, account, replyText, token)

    if (!result.success) {
      if (result.isAuthError) {
        await this.socialAccountService.deactivate(
          account.id,
          result.error ?? 'oauth error',
        )
      } else if (result.error) {
        await this.socialAccountService.recordError(account.id, result.error)
      }

      return this.finish(eventId, SOCIAL_ACTION.FAILED, {
        intent: verdict.intent,
        intent_score: verdict.score,
        classifier: verdict.classifier,
        reply_text: replyText,
        wa_link: waLink,
        ref_code: refCode,
        error: result.error,
      })
    }

    await this.socialAccountService.clearError(account.id)

    return this.finish(eventId, SOCIAL_ACTION.REPLIED, {
      intent: verdict.intent,
      intent_score: verdict.score,
      classifier: verdict.classifier,
      reply_text: replyText,
      wa_link: waLink,
      ref_code: refCode,
      error: null,
    })
  }

  private dispatch(
    event: {
      event_type: string
      platform: string
      external_id: string
      external_user_id: string | null
    },
    account: {
      external_id: string
      page_id: string | null
      ig_user_id: string | null
    },
    replyText: string,
    token: string,
  ) {
    if (event.event_type === SOCIAL_EVENT_TYPE.COMMENT) {
      return event.platform === SOCIAL_PLATFORM.INSTAGRAM
        ? this.graph.replyToInstagramComment(
            event.external_id,
            replyText,
            token,
          )
        : this.graph.replyToFacebookComment(event.external_id, replyText, token)
    }

    const recipientId = event.external_user_id as string

    if (event.platform === SOCIAL_PLATFORM.INSTAGRAM) {
      return this.graph.sendInstagramMessage(
        account.page_id || account.external_id,
        recipientId,
        replyText,
        token,
      )
    }

    return this.graph.sendMessengerMessage(
      account.page_id || account.external_id,
      recipientId,
      replyText,
      token,
    )
  }

  private async buildReplyText(input: {
    eventType: string
    platform: string
    eventId: number
    authorName: string | null
    message: string
    companyName: string
    companyProfile: string | null
    waLink: string | null
    context: string | null
  }): Promise<string> {
    const fallback = this.fallbackReply(input)
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return fallback

    try {
      const google = createGoogleGenerativeAI({ apiKey })
      const { text } = await generateText({
        model: google(socialConfig.intentModel),
        system: SOCIAL_REPLY_SYSTEM_PROMPT,
        temperature: 0.35,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  platform: input.platform,
                  event_type: input.eventType,
                  author_first_name:
                    (input.authorName || '').split(' ')[0] || null,
                  message: input.message.slice(0, 500),
                  agency: input.companyName,
                  agency_profile: input.companyProfile,
                  known_context: input.context,
                  whatsapp_url: input.waLink,
                }),
              },
            ],
          },
        ],
      })
      const reply = this.parseReply(text)
      if (!reply) return fallback
      if (
        input.platform === SOCIAL_PLATFORM.INSTAGRAM &&
        input.eventType === SOCIAL_EVENT_TYPE.COMMENT &&
        /https?:\/\/|wa\.me\//i.test(reply)
      ) {
        return fallback
      }
      const limit =
        input.eventType === SOCIAL_EVENT_TYPE.COMMENT ? 280 : 500
      return reply.slice(0, limit)
    } catch (error) {
      this.logger.error('Contextual social reply generation failed', error?.message)
      return fallback
    }
  }

  private fallbackReply(input: {
    eventType: string
    platform: string
    eventId: number
    authorName: string | null
    waLink: string | null
    context?: string | null
  }): string {
    const name = (input.authorName || '').split(' ')[0] || 'there'
    if (
      input.platform === SOCIAL_PLATFORM.INSTAGRAM &&
      input.eventType === SOCIAL_EVENT_TYPE.COMMENT
    ) {
      return `Hi ${name} 👋 Thanks for your interest. Send us a DM with “DETAILS” and we’ll confirm the price, availability and inspection options for you.`
    }

    const template =
      input.eventType === SOCIAL_EVENT_TYPE.DM
        ? DM_REPLY_TEMPLATE
        : COMMENT_REPLY_TEMPLATES[
            input.eventId % COMMENT_REPLY_TEMPLATES.length
          ]

    return template
      .replace('{name}', name)
      .replace('{link}', input.waLink || '')
      .trim()
  }

  private parseReply(raw: string): string | null {
    if (!raw) return null
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      const reply = String(JSON.parse(raw.slice(start, end + 1)).reply || '').trim()
      return reply ? reply.slice(0, 500) : null
    } catch {
      return null
    }
  }

  private async replyContext(contentPostId: number | null): Promise<string | null> {
    if (!contentPostId) return null
    const post = await this.prisma.content_posts.findUnique({
      where: { id: contentPostId },
      include: { property: true },
    })
    if (!post) return null

    const facts: string[] = []
    const property = post.property
    if (property) {
      facts.push(`Property: ${property.title}`)
      if (property.location) facts.push(`Location: ${property.location}`)
      if (property.state) facts.push(`State: ${property.state}`)
      if (property.price != null) {
        facts.push(`Price: ${property.currency || 'NGN'} ${property.price}`)
      }
      if (property.title_document) {
        facts.push(`Title document: ${property.title_document}`)
      }
      if (property.payment_plan) facts.push(`Payment plan: ${property.payment_plan}`)
      facts.push(`Availability: ${property.status}`)
    }
    facts.push(`Published post: ${post.caption.slice(0, 700)}`)
    return facts.join('\n')
  }

  private companyProfile(value: unknown): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const description = (value as Record<string, unknown>).description
    return typeof description === 'string' && description.trim()
      ? description.trim().slice(0, 1000)
      : null
  }

  private async isRateLimited(accountId: number): Promise<boolean> {
    const since = new Date(Date.now() - 60 * 60 * 1000)
    const replied = await this.prisma.social_events.count({
      where: {
        social_account_id: accountId,
        action: SOCIAL_ACTION.REPLIED,
        created_at: { gt: since },
      },
    })
    return replied >= socialConfig.maxRepliesPerHourPerAccount
  }

  private async finish(
    eventId: number,
    action: string,
    data: Record<string, any>,
  ): Promise<string> {
    await this.prisma.social_events.update({
      where: { id: eventId },
      data: { action, ...data },
    })
    return action
  }
}
