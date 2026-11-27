import { Injectable, Logger } from '@nestjs/common'
import { AiRoutingService } from '../../ai-routing/ai-routing.service'
import { AiWorkload } from '../../ai-routing/ai-routing.types'
import { PrismaService } from '../../prisma/prisma.service'
import { extractPhone, normalizeNgPhone } from '../../leads/scrapers/extract'
import { parseState } from '../../leads/scrapers/location'
import { BuyerFinderAllocationService } from './buyer-finder-allocation.service'

type Verdict = {
  is_high_intent: boolean
  intent_score: number
  reason: string
  dm_script: string
  whatsapp_script: string
  classifier: string
}

const INTENT_PATTERN =
  /\b(how much|price|location|available|payment plan|inspection|inspect|c\s*of\s*o|title|send (me )?(details|picture|video)|interested|want to buy|want to rent|abeg|wetin)\b/i
const NOISE_PATTERN =
  /^(nice|beautiful|wow|lovely|amazing|congratulations|great|cool|good one)(\s+(house|home|property|place|one))?[\s!.]*$/i

@Injectable()
export class BuyerFinderClassifierService {
  private readonly logger = new Logger(BuyerFinderClassifierService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouting: AiRoutingService,
    private readonly allocation: BuyerFinderAllocationService,
  ) {}

  async classify(commentId: number) {
    const comment = await this.prisma.buyer_finder_comments.findUnique({
      where: { id: commentId },
      include: { post: { include: { account: true } } },
    })
    if (!comment || comment.status === 'classified') return null

    const text = comment.comment_text.trim()
    const phoneText = extractPhone(text, comment.author_bio || '')
    const normalized = normalizeNgPhone(phoneText)
    const phone = normalized
      ? BigInt(normalized.replace(/\D/g, ''))
      : comment.phone_normalized
    const location =
      parseState(
        `${comment.post.specific_location || ''} ${comment.post.caption || ''}`,
      ) ||
      comment.post.account?.states?.[0] ||
      null

    let verdict: Verdict
    if (
      !text ||
      text.length <= 2 ||
      !/[a-z0-9]/i.test(text) ||
      NOISE_PATTERN.test(text)
    ) {
      verdict = this.ruleVerdict(false, 1, 'Praise or low-information comment')
    } else {
      verdict = await this.modelVerdict(comment, Boolean(phone))
    }

    const channel = phone ? 'whatsapp' : comment.platform.toLowerCase()
    const candidate = await this.prisma.$transaction(async tx => {
      const row = await tx.buyer_finder_candidates.upsert({
        where: { comment_id: comment.id },
        create: {
          comment_id: comment.id,
          is_high_intent: verdict.is_high_intent,
          intent_score: verdict.intent_score,
          intent_reason: verdict.reason.slice(0, 240),
          classifier: verdict.classifier,
          channel,
          phone_normalized: phone,
          profile_url: comment.author_profile_url,
          location_state: location,
          dm_script: verdict.dm_script,
          whatsapp_script: verdict.whatsapp_script,
          status: verdict.is_high_intent ? 'qualified' : 'rejected',
        },
        update: {
          is_high_intent: verdict.is_high_intent,
          intent_score: verdict.intent_score,
          intent_reason: verdict.reason.slice(0, 240),
          classifier: verdict.classifier,
          channel,
          phone_normalized: phone,
          profile_url: comment.author_profile_url,
          location_state: location,
          dm_script: verdict.dm_script,
          whatsapp_script: verdict.whatsapp_script,
          status: verdict.is_high_intent ? 'qualified' : 'rejected',
        },
      })
      await tx.buyer_finder_comments.update({
        where: { id: comment.id },
        data: { status: 'classified', phone_normalized: phone },
      })
      return row
    })

    if (candidate.is_high_intent) await this.allocation.allocate(candidate.id)
    return candidate
  }

  private async modelVerdict(
    comment: any,
    hasPhone: boolean,
  ): Promise<Verdict> {
    const obviousIntent = INTENT_PATTERN.test(comment.comment_text)
    const fallback = this.ruleVerdict(
      obviousIntent,
      obviousIntent ? 8 : 3,
      obviousIntent ? 'Clear property enquiry' : 'No clear buying signal',
    )
    try {
      const result = await this.aiRouting.generate({
        workload: AiWorkload.BuyerFinder,
        routingKey: `buyer-finder:${comment.platform}:${comment.id}`,
        temperature: 0.1,
        maxOutputTokens: 420,
        system: `You qualify public comments on Nigerian real-estate posts. Return strict JSON only.
High intent includes price, availability, location, title documents, payment plan, inspection, pictures, videos, buying or renting. Understand Nigerian English and Pidgin. Reject emoji-only praise, tags, unrelated comments, spam and rival agents.
Write short natural outreach scripts with no links and no invented property facts.
Schema: {"is_high_intent":boolean,"intent_score":1,"reason":"max 12 words","dm_script":"string","whatsapp_script":"string"}`,
        prompt: `Platform: ${comment.platform}
Property: ${comment.post.property_type || 'property'}
Location: ${comment.post.specific_location || 'not stated'}
Post caption: ${(comment.post.caption || '').slice(0, 1000)}
Comment: ${comment.comment_text.slice(0, 500)}
Public phone found: ${hasPhone ? 'yes' : 'no'}`,
      })
      const parsed = this.parse(result.text)
      if (!parsed) return fallback
      return { ...parsed, classifier: result.provider }
    } catch {
      this.logger.warn(
        `Buyer Finder classification fell back to rules for comment ${comment.id}`,
      )
      return fallback
    }
  }

  private parse(raw: string): Omit<Verdict, 'classifier'> | null {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      const value = JSON.parse(raw.slice(start, end + 1))
      const score = Math.max(
        1,
        Math.min(10, Math.round(Number(value.intent_score))),
      )
      if (!Number.isFinite(score)) return null
      return {
        is_high_intent: Boolean(value.is_high_intent) && score >= 7,
        intent_score: score,
        reason: String(value.reason || 'Model classification'),
        dm_script: String(value.dm_script || ''),
        whatsapp_script: String(value.whatsapp_script || ''),
      }
    } catch {
      return null
    }
  }

  private ruleVerdict(high: boolean, score: number, reason: string): Verdict {
    return {
      is_high_intent: high,
      intent_score: score,
      reason,
      classifier: 'rule',
      dm_script: high
        ? 'Hi, I saw your comment on a property post. Would you like the current price and availability?'
        : '',
      whatsapp_script: high
        ? 'Hello, I saw your enquiry about a property. Are you still interested in receiving the current details?'
        : '',
    }
  }
}
