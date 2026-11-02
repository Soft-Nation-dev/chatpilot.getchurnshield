import { Injectable } from '@nestjs/common'
import { AiRoutingService } from 'src/ai-routing/ai-routing.service'
import { AiWorkload } from 'src/ai-routing/ai-routing.types'
import { ChatState } from './chat-lifecycle.service'

export type ReengagementVerdict = {
  shouldResume: boolean
  intent: string
  confidence: number
  classifier: string
  reason: string
}

@Injectable()
export class IntentTriageService {
  constructor(private readonly aiRouting: AiRoutingService) {}

  classify(text: string): {
    state: ChatState
    reason: string
    automate: boolean
  } {
    const value = text.toLowerCase().replace(/\s+/g, ' ').trim()
    if (
      /\b(stop|unsubscribe|do not message|don't message|remove my number|not interested)\b/.test(
        value,
      )
    ) {
      return {
        state: 'CONCLUDED_CLOSED',
        reason: 'Customer opted out or ended the sales conversation',
        automate: false,
      }
    }
    if (
      /\b(i (?:am|'m) (?:a )?(?:vendor|supplier|agent|realtor)|partnership|complaint|technical support|account issue|payment issue|speak (?:to|with) (?:a )?(?:person|human|manager|agent))\b/.test(
        value,
      )
    ) {
      return {
        state: 'HUMAN_TAKEOVER',
        reason: 'Non-buyer or explicit human-support intent detected',
        automate: false,
      }
    }
    return {
      state: 'QUALIFYING',
      reason: 'Inbound buyer conversation started or resumed',
      automate: true,
    }
  }

  async classifyReengagement(
    text: string,
    metadata: { companyId?: number | null; contactId?: number | null } = {},
  ): Promise<ReengagementVerdict> {
    const value = text
      .toLowerCase()
      .replace(/\[media:[^\]]+\]/g, ' media ')
      .replace(/\s+/g, ' ')
      .trim()
    const blocked = (
      intent: string,
      reason: string,
      confidence = 1,
      classifier = 'rule',
    ): ReengagementVerdict => ({
      shouldResume: false,
      intent,
      confidence,
      classifier,
      reason,
    })
    const resume = (
      intent: string,
      reason: string,
      confidence = 0.95,
      classifier = 'rule',
    ): ReengagementVerdict => ({
      shouldResume: true,
      intent,
      confidence,
      classifier,
      reason,
    })

    if (!value || !/[a-z0-9]/i.test(value)) {
      return blocked('unclear', 'No actionable business intent detected')
    }
    if (
      /\b(stop|unsubscribe|do not message|don't message|remove my number|not interested|leave me alone)\b/.test(
        value,
      )
    ) {
      return blocked('opt_out', 'Customer opted out of automated replies')
    }
    if (
      /\b(speak|talk|connect|transfer) (?:me )?(?:to|with) (?:a )?(?:person|human|manager|agent|staff|team)|\bcomplaint\b|\baccount issue\b|\bpayment issue\b/.test(
        value,
      )
    ) {
      return blocked(
        'human_support',
        'Customer requested human assistance or raised a support issue',
      )
    }
    if (
      /^(?:(?:hi|hello|hey|good (?:morning|afternoon|evening)|okay|ok|alright|thanks|thank you|noted|cool|fine|yes|no|sure|lol)|[,.!\s😂👍])+$/u.test(
        value,
      )
    ) {
      return blocked(
        'social_or_acknowledgement',
        'Greeting or acknowledgement does not reopen automation',
      )
    }

    const inspection =
      /\b(inspection|viewing|site visit|book|schedule|reschedule|appointment|available (?:day|time)|what time|which day)\b/
    const media =
      /\b(picture|pictures|photo|photos|image|images|video|videos|media|brochure|floor ?plan)\b/
    const commercial =
      /\b(price|cost|how much|budget|payment plan|installment|deposit|title document|certificate of occupancy|c of o|deed|available|availability)\b/
    const inventory =
      /\b(property|properties|house|home|land|plot|apartment|flat|duplex|terrace|bungalow|bedroom|sqm|estate|location|lekki|ikoyi|ajah|abuja|lagos|port harcourt|buy|rent|invest|listing|unit)\b/
    const newChoice =
      /\b(another|other|else|alternative|similar|different|show me|send me|do you have|i (?:want|need|am looking)|i'd like|i would like|interested in)\b/

    if (inspection.test(value)) {
      return resume(
        'inspection',
        'New inspection or scheduling request detected',
      )
    }
    if (media.test(value) && (inventory.test(value) || newChoice.test(value))) {
      return resume('property_media', 'New property media request detected')
    }
    if (
      commercial.test(value) &&
      (inventory.test(value) || newChoice.test(value))
    ) {
      return resume(
        'property_details',
        'New price, availability, or property-detail request detected',
      )
    }
    if (inventory.test(value) && newChoice.test(value)) {
      return resume('property_search', 'New property search request detected')
    }

    try {
      const result = await this.aiRouting.generate({
        workload: AiWorkload.Social,
        companyId: metadata.companyId,
        contactId: metadata.contactId,
        routingKey: metadata.contactId
          ? `whatsapp-intent:${metadata.contactId}`
          : undefined,
        system:
          'You are a strict routing classifier for a real-estate WhatsApp assistant. Classify only the latest customer message. A business_query is a concrete, answerable request about property search, property facts, media, availability, price, payment, inspection, buying, renting, or investment. Greetings, acknowledgements, jokes, complaints, requests for a human, opt-outs, and vague continuation messages are not business_query. Return JSON only: {"intent":"business_query|human_support|opt_out|social|unclear","topic":"property_search|property_details|property_media|inspection|other","confidence":0.0}. Do not include reasoning.',
        prompt: text.slice(0, 700),
        temperature: 0,
        maxOutputTokens: 90,
      })
      const parsed = this.parseReengagement(result.text)
      if (
        parsed?.intent === 'business_query' &&
        parsed.confidence >= 0.85 &&
        parsed.topic !== 'other'
      ) {
        return resume(
          parsed.topic,
          `New ${parsed.topic.replaceAll('_', ' ')} request detected`,
          parsed.confidence,
          result.provider,
        )
      }
      return blocked(
        parsed?.intent || 'unclear',
        'Message was not a high-confidence new business enquiry',
        parsed?.confidence || 0,
        result.provider,
      )
    } catch {
      return blocked(
        'unclear',
        'Intent classification was unavailable; chat remains under review',
        0,
        'unavailable',
      )
    }
  }

  private parseReengagement(raw: string): {
    intent: string
    topic: string
    confidence: number
  } | null {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      const value = JSON.parse(raw.slice(start, end + 1))
      const intent = String(value.intent || 'unclear')
      const topic = String(value.topic || 'other')
      const confidence = Number(value.confidence)
      if (
        ![
          'business_query',
          'human_support',
          'opt_out',
          'social',
          'unclear',
        ].includes(intent) ||
        ![
          'property_search',
          'property_details',
          'property_media',
          'inspection',
          'other',
        ].includes(topic)
      ) {
        return null
      }
      return {
        intent,
        topic,
        confidence: Number.isFinite(confidence)
          ? Math.max(0, Math.min(1, confidence))
          : 0,
      }
    } catch {
      return null
    }
  }
}
