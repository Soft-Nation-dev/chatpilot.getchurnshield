import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'

export const CHAT_STATES = [
  'NEW',
  'QUALIFYING',
  'QUALIFIED',
  'INSPECTION_PENDING',
  'INSPECTION_BOOKED',
  'HUMAN_TAKEOVER',
  'CONCLUDED_CLOSED',
  'COLD_LEAD',
] as const

export type ChatState = (typeof CHAT_STATES)[number]
export const REVIEW_MODES = ['ACTIVE', 'SOFT_REVIEW', 'HARD_TAKEOVER'] as const
export type ReviewMode = (typeof REVIEW_MODES)[number]
export type AutomationAction =
  | 'INBOUND_REPLY'
  | 'FOLLOW_UP'
  | 'MEDIA_SEND'
  | 'OUTBOUND_AUTOMATION'

type GateContact = {
  id: number
  company_id?: number | null
  chat_state?: string | null
  is_bot_activated?: boolean | null
  is_replies_activated?: boolean | null
  crm_appointment_id?: string | null
  review_mode?: string | null
  last_human_message_at?: Date | null
  companies?: { is_bot_activated?: boolean | null } | null
}

@Injectable()
export class ChatLifecycleService {
  private readonly logger = new Logger(ChatLifecycleService.name)

  constructor(private readonly prisma: PrismaService) {}

  evaluate(contact: GateContact, action: AutomationAction) {
    const state = (contact.chat_state || 'NEW') as ChatState
    const reviewMode = (contact.review_mode || 'ACTIVE') as ReviewMode
    if (reviewMode === 'HARD_TAKEOVER') {
      return { allowed: false, reason: 'hard_takeover', state, reviewMode }
    }
    if (reviewMode === 'SOFT_REVIEW') {
      return { allowed: false, reason: 'soft_review', state, reviewMode }
    }
    if (
      !contact.is_bot_activated ||
      !contact.is_replies_activated ||
      contact.companies?.is_bot_activated === false
    ) {
      return {
        allowed: false,
        reason: 'automation_paused',
        state,
        reviewMode,
      }
    }

    if (['HUMAN_TAKEOVER', 'CONCLUDED_CLOSED'].includes(state)) {
      return {
        allowed: false,
        reason: `state_${state.toLowerCase()}`,
        state,
        reviewMode,
      }
    }
    if (state === 'COLD_LEAD' && action !== 'INBOUND_REPLY') {
      return { allowed: false, reason: 'cold_lead', state, reviewMode }
    }
    if (
      (state === 'INSPECTION_BOOKED' || contact.crm_appointment_id) &&
      action !== 'INBOUND_REPLY'
    ) {
      return {
        allowed: false,
        reason: 'inspection_already_booked',
        state,
        reviewMode,
      }
    }
    return { allowed: true, reason: 'allowed', state, reviewMode }
  }

  async gate(contactId: number, action: AutomationAction) {
    const contact = await this.prisma.contacts.findUnique({
      where: { id: contactId },
      include: { companies: true },
    })
    if (!contact) {
      return { allowed: false, reason: 'contact_not_found', state: 'NEW' }
    }
    return this.evaluate(contact, action)
  }

  async transition(
    contactId: number,
    toState: ChatState,
    options: { reason?: string; actor?: string; jobId?: string } = {},
  ) {
    return this.prisma.$transaction(async tx => {
      const contact = await tx.contacts.findUnique({ where: { id: contactId } })
      if (!contact || !contact.company_id) return contact
      const fromState = (contact.chat_state || 'NEW') as ChatState
      if (fromState === toState) return contact

      const updated = await tx.contacts.update({
        where: { id: contactId },
        data: {
          chat_state: toState,
          chat_state_version: { increment: 1 },
          state_changed_at: new Date(),
          state_change_reason: options.reason?.slice(0, 240) || null,
          ...(toState === 'HUMAN_TAKEOVER'
            ? {
                is_replies_activated: false,
                needs_review: true,
                review_mode:
                  contact.review_mode === 'HARD_TAKEOVER'
                    ? 'HARD_TAKEOVER'
                    : 'SOFT_REVIEW',
              }
            : {}),
        },
      })
      await tx.chat_state_transitions.create({
        data: {
          company_id: contact.company_id,
          contact_id: contactId,
          from_state: fromState,
          to_state: toState,
          reason: options.reason?.slice(0, 240) || null,
          actor: options.actor || 'system',
          job_id: options.jobId || null,
        },
      })
      if (toState === 'QUALIFIED') {
        const budget = contact.budget_max
          ? `${contact.budget_currency || 'NGN'} ${Number(contact.budget_max).toLocaleString()}`
          : contact.budget_raw || null
        const summary = [
          contact.property_type,
          contact.preferred_location
            ? `in ${contact.preferred_location}`
            : null,
          budget ? `budget ${budget}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        const title = contact.name || contact.whatsapp_profile_name || 'A lead'
        await tx.notifications.upsert({
          where: {
            company_id_dedupe_key: {
              company_id: contact.company_id,
              dedupe_key: `qualified-lead:${contact.id}`,
            },
          },
          create: {
            company_id: contact.company_id,
            type: 'qualified_lead',
            severity: 'success',
            title: 'New qualified WhatsApp lead',
            message: `${title} is qualified${summary ? ` — ${summary}` : ''}. Open the chat to review and follow up.`,
            entity: 'chat',
            entity_id: String(contact.id),
            dedupe_key: `qualified-lead:${contact.id}`,
          },
          update: {
            message: `${title} is qualified${summary ? ` — ${summary}` : ''}. Open the chat to review and follow up.`,
          },
        })
      }
      this.logger.log(`Contact ${contactId}: ${fromState} -> ${toState}`)
      return updated
    })
  }

  async resumeAutomation(
    contactId: number,
    options: { reason?: string; actor?: string } = {},
  ) {
    return this.prisma.$transaction(async tx => {
      const contact = await tx.contacts.findUnique({ where: { id: contactId } })
      if (!contact || !contact.company_id) return contact

      const fromState = (contact.chat_state || 'NEW') as ChatState
      const conversationState = contact.conversation_state as any
      const clearTerminalHandoff =
        conversationState?.inspection?.status === 'awaiting_human'
      const reason = options.reason?.slice(0, 240) || 'Automation resumed'
      const updated = await tx.contacts.update({
        where: { id: contactId },
        data: {
          is_bot_activated: true,
          is_replies_activated: true,
          needs_review: false,
          review_mode: 'ACTIVE',
          chat_state: 'QUALIFYING',
          chat_state_version: { increment: 1 },
          state_changed_at: new Date(),
          state_change_reason: reason,
          ...(clearTerminalHandoff
            ? {
                conversation_state: {
                  version: 1,
                  ...(conversationState?.memory
                    ? { memory: conversationState.memory }
                    : {}),
                },
              }
            : {}),
        },
      })

      if (fromState !== 'QUALIFYING') {
        await tx.chat_state_transitions.create({
          data: {
            company_id: contact.company_id,
            contact_id: contactId,
            from_state: fromState,
            to_state: 'QUALIFYING',
            reason,
            actor: options.actor || 'system',
          },
        })
      }
      this.logger.log(`Contact ${contactId}: ${fromState} -> QUALIFYING`)
      return updated
    })
  }

  async setReviewMode(
    contactId: number,
    mode: Exclude<ReviewMode, 'ACTIVE'>,
    options: {
      reason?: string
      actor?: string
      humanMessageAt?: Date
    } = {},
  ) {
    return this.prisma.$transaction(async tx => {
      const contact = await tx.contacts.findUnique({ where: { id: contactId } })
      if (!contact || !contact.company_id) return contact

      const fromState = (contact.chat_state || 'NEW') as ChatState
      const reason =
        options.reason?.slice(0, 240) ||
        (mode === 'HARD_TAKEOVER'
          ? 'Hard takeover enabled'
          : 'Soft review enabled')
      const modeChanged =
        contact.review_mode !== mode || contact.chat_state !== 'HUMAN_TAKEOVER'
      const updated = await tx.contacts.update({
        where: { id: contactId },
        data: {
          is_bot_activated: true,
          is_replies_activated: false,
          needs_review: true,
          review_mode: mode,
          chat_state: 'HUMAN_TAKEOVER',
          chat_state_version: { increment: 1 },
          state_changed_at: new Date(),
          state_change_reason: reason,
          ...(options.humanMessageAt
            ? { last_human_message_at: options.humanMessageAt }
            : {}),
        },
      })
      if (modeChanged) {
        await tx.chat_state_transitions.create({
          data: {
            company_id: contact.company_id,
            contact_id: contactId,
            from_state: fromState,
            to_state: 'HUMAN_TAKEOVER',
            reason,
            actor: options.actor || 'system',
          },
        })
        await tx.notifications.create({
          data: {
            company_id: contact.company_id,
            type: 'chat_review_mode',
            severity: mode === 'HARD_TAKEOVER' ? 'warning' : 'info',
            title:
              mode === 'HARD_TAKEOVER'
                ? 'Hard takeover enabled'
                : 'Soft review enabled',
            message:
              mode === 'HARD_TAKEOVER'
                ? 'AI replies are fully blocked for this chat until a team member resumes automation.'
                : 'AI replies are paused, but a clear new business enquiry can safely resume the conversation.',
            entity: 'chat',
            entity_id: String(contactId),
          },
        })
      }
      this.logger.log(`Contact ${contactId}: review mode -> ${mode}`)
      return updated
    })
  }

  async autoResumeForIntent(
    contactId: number,
    options: {
      reason: string
      intent: string
      confidence: number
      classifier: string
    },
  ): Promise<{
    resumed: boolean
    reason: string
    contact: any
  }> {
    return this.prisma.$transaction(async tx => {
      const contact = await tx.contacts.findUnique({ where: { id: contactId } })
      if (!contact || !contact.company_id) {
        return { resumed: false, reason: 'contact_not_found', contact }
      }
      if (contact.review_mode === 'HARD_TAKEOVER') {
        return { resumed: false, reason: 'hard_takeover', contact }
      }

      const humanLockMinutes = Math.max(
        5,
        Math.min(
          120,
          Number(process.env.WHATSAPP_HUMAN_ACTIVITY_LOCK_MIN || 20),
        ),
      )
      const humanLockActive =
        contact.review_mode === 'SOFT_REVIEW' &&
        contact.last_human_message_at &&
        Date.now() - contact.last_human_message_at.getTime() <
          humanLockMinutes * 60_000
      if (humanLockActive) {
        return { resumed: false, reason: 'recent_human_activity', contact }
      }

      const fromState = (contact.chat_state || 'NEW') as ChatState
      const conversationState = contact.conversation_state as any
      const clearTerminalHandoff =
        conversationState?.inspection?.status === 'awaiting_human'
      const reason = options.reason.slice(0, 240)
      const updated = await tx.contacts.update({
        where: { id: contactId },
        data: {
          is_bot_activated: true,
          is_replies_activated: true,
          needs_review: false,
          review_mode: 'ACTIVE',
          chat_state: 'QUALIFYING',
          chat_state_version: { increment: 1 },
          state_changed_at: new Date(),
          state_change_reason: reason,
          ...(clearTerminalHandoff
            ? {
                conversation_state: {
                  version: 1,
                  ...(conversationState?.memory
                    ? { memory: conversationState.memory }
                    : {}),
                },
              }
            : {}),
        },
      })
      await tx.chat_state_transitions.create({
        data: {
          company_id: contact.company_id,
          contact_id: contactId,
          from_state: fromState,
          to_state: 'QUALIFYING',
          reason,
          actor: 'intent_gate',
        },
      })
      await tx.automation_events.create({
        data: {
          company_id: contact.company_id,
          contact_id: contactId,
          job_type: 'intent_gate',
          status: 'succeeded',
          details: {
            intent: options.intent,
            confidence: options.confidence,
            classifier: options.classifier,
            previousState: fromState,
          },
          completed_at: new Date(),
        },
      })
      const notificationDedupeKey = `chat-auto-resumed:${contactId}:${Math.floor(Date.now() / 60000)}`
      await tx.notifications.upsert({
        where: {
          company_id_dedupe_key: {
            company_id: contact.company_id,
            dedupe_key: notificationDedupeKey,
          },
        },
        create: {
          company_id: contact.company_id,
          type: 'chat_auto_resumed',
          severity: 'success',
          title: 'AI resumed for a new WhatsApp enquiry',
          message: `${contact.name || contact.whatsapp_profile_name || 'A customer'} sent a new ${options.intent.replaceAll('_', ' ')} request. Soft review was released and AI reply processing resumed.`,
          entity: 'chat',
          entity_id: String(contactId),
          dedupe_key: notificationDedupeKey,
        },
        update: {},
      })
      this.logger.log(
        `Contact ${contactId}: ${fromState} -> QUALIFYING by ${options.classifier} intent gate`,
      )
      return { resumed: true, reason: 'business_intent', contact: updated }
    })
  }

  async recordAutomation(input: {
    companyId: number
    contactId?: number
    jobType: string
    status:
      | 'queued'
      | 'running'
      | 'succeeded'
      | 'failed'
      | 'blocked'
      | 'retrying'
    attempt?: number
    maxAttempts?: number
    jobId?: string
    latencyMs?: number
    error?: unknown
    details?: Record<string, unknown>
  }) {
    const error = input.error instanceof Error ? input.error : null
    return this.prisma.automation_events.create({
      data: {
        company_id: input.companyId,
        contact_id: input.contactId || null,
        job_type: input.jobType,
        status: input.status,
        attempt: input.attempt || 1,
        max_attempts: input.maxAttempts || 1,
        job_id: input.jobId || null,
        latency_ms: input.latencyMs,
        error_code: error?.name?.slice(0, 80) || null,
        error_message:
          error?.message || (input.error ? String(input.error) : null),
        details: input.details as any,
        completed_at: ['succeeded', 'failed', 'blocked'].includes(input.status)
          ? new Date()
          : null,
      },
    })
  }

  async operationalTimeline(companyId: number, contactId: number) {
    const [events, transitions] = await Promise.all([
      this.prisma.automation_events.findMany({
        where: { company_id: companyId, contact_id: contactId },
        orderBy: { started_at: 'desc' },
        take: 12,
      }),
      this.prisma.chat_state_transitions.findMany({
        where: { company_id: companyId, contact_id: contactId },
        orderBy: { created_at: 'desc' },
        take: 8,
      }),
    ])
    return { events, transitions }
  }
}
