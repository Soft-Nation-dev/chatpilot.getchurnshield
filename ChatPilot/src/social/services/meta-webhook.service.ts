import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import { PrismaService } from 'src/prisma/prisma.service'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { encryptMessage } from 'src/common/crypto/message-crypto'
import {
  MetaEntry,
  MetaWebhookBody,
  NormalizedSocialEvent,
} from '../dto/meta-webhook.dto'
import {
  SOCIAL_ACTION,
  SOCIAL_EVENT_TYPE,
  SOCIAL_PLATFORM,
} from '../constants/social.constants'
import { SocialAccountService } from './social-account.service'

@Injectable()
export class MetaWebhookService {
  private readonly logger = new Logger(MetaWebhookService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly socialAccountService: SocialAccountService,
    @InjectQueue(BackgroundQueue.SOCIAL) private readonly socialQueue: Queue,
  ) {}

  async ingest(body: MetaWebhookBody): Promise<void> {
    const platform =
      body?.object === 'instagram'
        ? SOCIAL_PLATFORM.INSTAGRAM
        : SOCIAL_PLATFORM.FACEBOOK

    for (const entry of body?.entry ?? []) {
      const events = this.normalizeEntry(platform, entry)
      for (const event of events) {
        try {
          await this.persistAndQueue(event)
        } catch (error) {
          this.logger.error('Failed to ingest social event', error?.message)
        }
      }
    }
  }

  private normalizeEntry(
    platform: string,
    entry: MetaEntry,
  ): NormalizedSocialEvent[] {
    const accountExternalId = entry?.id
    if (!accountExternalId) return []

    const events: NormalizedSocialEvent[] = []

    for (const change of entry.changes ?? []) {
      const value = change?.value
      if (!value) continue

      if (change.field === 'feed') {
        if (value.item !== 'comment' || value.verb !== 'add') continue
        const externalId = value.comment_id
        const authorId = value.from?.id
        if (!externalId || !authorId) continue
        if (authorId === accountExternalId) continue

        events.push({
          platform,
          eventType: SOCIAL_EVENT_TYPE.COMMENT,
          accountExternalId,
          externalId,
          externalUserId: authorId,
          externalUserName: value.from?.name ?? null,
          postId: value.post_id ?? null,
          parentId: value.parent_id ?? null,
          text: value.message ?? null,
        })
        continue
      }

      if (change.field === 'comments') {
        const externalId = value.id
        const authorId = value.from?.id
        if (!externalId || !authorId) continue
        if (authorId === accountExternalId) continue

        events.push({
          platform,
          eventType: SOCIAL_EVENT_TYPE.COMMENT,
          accountExternalId,
          externalId,
          externalUserId: authorId,
          externalUserName: value.from?.username ?? null,
          postId: value.media?.id ?? null,
          parentId: value.parent_id ?? null,
          text: value.text ?? null,
        })
      }
    }

    for (const messaging of entry.messaging ?? []) {
      if (messaging?.delivery || messaging?.read || messaging?.reaction) continue
      const message = messaging?.message
      if (!message || message.is_echo) continue

      const externalId = message.mid
      const senderId = messaging.sender?.id
      if (!externalId || !senderId) continue
      if (senderId === accountExternalId) continue

      events.push({
        platform,
        eventType: SOCIAL_EVENT_TYPE.DM,
        accountExternalId,
        externalId,
        externalUserId: senderId,
        externalUserName: null,
        postId: null,
        parentId: null,
        text: message.text ?? null,
      })
    }

    return events
  }

  private async persistAndQueue(
    normalized: NormalizedSocialEvent,
  ): Promise<void> {
    const account = await this.socialAccountService.resolveByExternalId(
      normalized.accountExternalId,
    )

    if (!account) {
      await this.safeCreate({
        company_id: null,
        social_account_id: null,
        platform: normalized.platform,
        event_type: normalized.eventType,
        external_id: normalized.externalId,
        external_user_id: normalized.externalUserId,
        external_user_name: normalized.externalUserName,
        post_id: normalized.postId,
        parent_id: normalized.parentId,
        text: encryptMessage(normalized.text ?? ''),
        action: SOCIAL_ACTION.UNKNOWN_ACCOUNT,
      })
      this.logger.warn(
        `No active social account for external id ${normalized.accountExternalId}`,
      )
      return
    }

    const ownIds = await this.socialAccountService.externalIdsForCompany(
      account.company_id,
    )
    if (
      normalized.externalUserId &&
      ownIds.has(normalized.externalUserId)
    ) {
      return
    }

    const event = await this.safeCreate({
      company_id: account.company_id,
      social_account_id: account.id,
      platform: normalized.platform,
      event_type: normalized.eventType,
      external_id: normalized.externalId,
      external_user_id: normalized.externalUserId,
      external_user_name: normalized.externalUserName,
      post_id: normalized.postId,
      parent_id: normalized.parentId,
      text: encryptMessage(normalized.text ?? ''),
      action: SOCIAL_ACTION.RECEIVED,
    })

    if (!event) return

    await this.socialQueue.add(
      BackgroundQueue.SOCIAL,
      { eventId: event.id },
      { attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
    )
  }

  private async safeCreate(data: any) {
    try {
      return await this.prisma.social_events.create({ data })
    } catch (error) {
      if (error?.code === 'P2002') return null
      throw error
    }
  }
}
