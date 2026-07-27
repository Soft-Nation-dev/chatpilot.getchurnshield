import { Injectable, Logger } from '@nestjs/common'
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

    const refCode = this.waLink.generateRefCode()
    const waLink = this.waLink.build(company, event.platform, refCode)

    if (!waLink) {
      this.logger.error(
        `Company ${company.id} has no usable WhatsApp number for wa.me links`,
      )
      return this.finish(eventId, SOCIAL_ACTION.SKIPPED_BAD_PHONE, {
        intent: verdict.intent,
        intent_score: verdict.score,
        classifier: verdict.classifier,
      })
    }

    const replyText = this.buildReplyText(
      event.event_type,
      event.id,
      event.external_user_name,
      waLink,
    )

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
    event: { event_type: string; platform: string; external_id: string; external_user_id: string | null },
    account: { external_id: string; page_id: string | null; ig_user_id: string | null },
    replyText: string,
    token: string,
  ) {
    if (event.event_type === SOCIAL_EVENT_TYPE.COMMENT) {
      return event.platform === SOCIAL_PLATFORM.INSTAGRAM
        ? this.graph.replyToInstagramComment(event.external_id, replyText, token)
        : this.graph.replyToFacebookComment(event.external_id, replyText, token)
    }

    const recipientId = event.external_user_id as string

    if (event.platform === SOCIAL_PLATFORM.INSTAGRAM) {
      return this.graph.sendInstagramMessage(
        account.ig_user_id || account.external_id,
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

  private buildReplyText(
    eventType: string,
    eventId: number,
    authorName: string | null,
    waLink: string,
  ): string {
    const name = (authorName || '').split(' ')[0] || 'there'
    const template =
      eventType === SOCIAL_EVENT_TYPE.DM
        ? DM_REPLY_TEMPLATE
        : COMMENT_REPLY_TEMPLATES[eventId % COMMENT_REPLY_TEMPLATES.length]

    return template.replace('{name}', name).replace('{link}', waLink)
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
