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
  companies?: { is_bot_activated?: boolean | null } | null
}

@Injectable()
export class ChatLifecycleService {
  private readonly logger = new Logger(ChatLifecycleService.name)

  constructor(private readonly prisma: PrismaService) {}

  evaluate(contact: GateContact, action: AutomationAction) {
    const state = (contact.chat_state || 'NEW') as ChatState
    if (
      !contact.is_bot_activated ||
      !contact.is_replies_activated ||
      contact.companies?.is_bot_activated === false
    ) {
      return { allowed: false, reason: 'automation_paused', state }
    }

    if (['HUMAN_TAKEOVER', 'CONCLUDED_CLOSED'].includes(state)) {
      return { allowed: false, reason: `state_${state.toLowerCase()}`, state }
    }
    if (state === 'COLD_LEAD' && action !== 'INBOUND_REPLY') {
      return { allowed: false, reason: 'cold_lead', state }
    }
    if (
      (state === 'INSPECTION_BOOKED' || contact.crm_appointment_id) &&
      action !== 'INBOUND_REPLY'
    ) {
      return { allowed: false, reason: 'inspection_already_booked', state }
    }
    return { allowed: true, reason: 'allowed', state }
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
            ? { is_replies_activated: false, needs_review: true }
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
          chat_state: 'QUALIFYING',
          chat_state_version: { increment: 1 },
          state_changed_at: new Date(),
          state_change_reason: reason,
          ...(clearTerminalHandoff
            ? { conversation_state: { version: 1 } }
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

  async recordAutomation(input: {
    companyId: number
    contactId?: number
    jobType: string
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'retrying'
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
        error_message: error?.message || (input.error ? String(input.error) : null),
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
