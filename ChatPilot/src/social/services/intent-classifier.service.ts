import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { AiRoutingService } from 'src/ai-routing/ai-routing.service'
import { AiWorkload } from 'src/ai-routing/ai-routing.types'
import { socialConfig } from '../social.config'
import { INTENT_SYSTEM_PROMPT } from '../constants/intent-prompt'
import {
  INTEREST_PATTERN,
  PIDGIN_PATTERN,
  PRAISE_ONLY,
  PRICE_PATTERN,
} from '../constants/social.constants'

export type IntentVerdict = {
  intent: string
  score: number
  classifier: string
  shouldReply: boolean
}

const NOISE: IntentVerdict = {
  intent: 'noise',
  score: 0,
  classifier: 'rule',
  shouldReply: false,
}

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouting: AiRoutingService,
  ) {}

  async classify(event: {
    id: number
    text: string | null
    post_id: string | null
    external_user_id: string | null
    social_account_id: number | null
  }): Promise<IntentVerdict> {
    const text = (event.text || '').trim()

    if (!text || text.length <= 2) return NOISE
    if (!/[a-z0-9]/i.test(text)) return NOISE

    const lower = text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .trim()
    if (PRAISE_ONLY.includes(lower)) return NOISE

    if (await this.isRepeatAuthor(event)) {
      return { ...NOISE, classifier: 'dedupe' }
    }

    if (
      PRICE_PATTERN.test(text) ||
      INTEREST_PATTERN.test(text) ||
      PIDGIN_PATTERN.test(text)
    ) {
      return {
        intent: 'buying',
        score: 0.9,
        classifier: 'keyword',
        shouldReply: true,
      }
    }

    return this.classifyWithModel(text)
  }

  private async isRepeatAuthor(event: {
    id: number
    post_id: string | null
    external_user_id: string | null
    social_account_id: number | null
  }): Promise<boolean> {
    if (!event.external_user_id || !event.post_id) return false

    const since = new Date(
      Date.now() - socialConfig.dedupeWindowMin * 60 * 1000,
    )

    const seen = await this.prisma.social_events.count({
      where: {
        id: { not: event.id },
        social_account_id: event.social_account_id,
        external_user_id: event.external_user_id,
        post_id: event.post_id,
        action: 'replied',
        created_at: { gt: since },
      },
    })

    return seen > 0
  }

  private async classifyWithModel(text: string): Promise<IntentVerdict> {
    try {
      const result = await this.aiRouting.generate({
        workload: AiWorkload.Social,
        system: INTENT_SYSTEM_PROMPT,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: text.slice(0, 500) }],
          },
        ],
        maxOutputTokens: 150,
      })

      const parsed = this.parseVerdict(result.text)
      if (!parsed) return { ...NOISE, classifier: 'error' }

      return {
        intent: parsed.intent,
        score: parsed.score,
        classifier: result.provider,
        shouldReply:
          parsed.intent !== 'noise' &&
          parsed.score >= socialConfig.intentThreshold,
      }
    } catch (error) {
      this.logger.error('Intent classification failed', error?.message)
      return { ...NOISE, classifier: 'error' }
    }
  }

  private parseVerdict(raw: string): { intent: string; score: number } | null {
    if (!raw) return null
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null

    try {
      const parsed = JSON.parse(raw.slice(start, end + 1))
      const intent = String(parsed.intent || 'noise')
      const score = Number(parsed.score)
      if (!['buying', 'question', 'noise'].includes(intent)) return null
      return { intent, score: Number.isFinite(score) ? score : 0 }
    } catch {
      return null
    }
  }
}
