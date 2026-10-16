import { Injectable } from '@nestjs/common'
import { ChatState } from './chat-lifecycle.service'

@Injectable()
export class IntentTriageService {
  classify(text: string): { state: ChatState; reason: string; automate: boolean } {
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
}
