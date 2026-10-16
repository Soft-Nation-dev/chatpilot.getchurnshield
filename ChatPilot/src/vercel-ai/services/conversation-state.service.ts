import { Injectable, Logger } from '@nestjs/common'
import { DateTime } from 'luxon'
import { PrismaService } from 'src/prisma/prisma.service'
import { AiChatMessage, Contact } from 'src/utils/constants/types'
import { ChatLifecycleService } from 'src/contact/chat-lifecycle.service'

export type InspectionStatus =
  | 'collecting_property'
  | 'collecting_day'
  | 'collecting_time'
  | 'collecting_name'
  | 'collecting_email'
  | 'checking_availability'
  | 'awaiting_confirmation'
  | 'awaiting_human'
  | 'booked'

export type ConversationState = {
  version: 1
  inspection?: {
    status: InspectionStatus
    propertyId?: number
    propertyTitle?: string
    requestedDay?: string
    requestedDate?: string
    requestedTime?: string
    email?: string
    selectedDateTime?: string
    availableSlots?: string[]
    updatedAt: string
  }
}

export type PreparedConversationTurn = {
  state: ConversationState | null
  systemContext: string
  deterministicReply: string | null
}

const SCHEDULING_TERMS =
  /\b(appointment|inspection|inspect|viewing|schedule|booking|book|slot|visit|come\s+(?:and\s+)?see)\b/i
const ACKNOWLEDGEMENT =
  /^(?:yes|yeah|yep|ok(?:ay)?|alright|sure|thanks?|thank you|noted|perfect|great|that works)(?:[\s!.]|$)/i

@Injectable()
export class ConversationStateService {
  private readonly logger = new Logger(ConversationStateService.name)
  private readonly timezone = process.env.DEFAULT_TIMEZONE || 'Africa/Lagos'

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatLifecycle: ChatLifecycleService,
  ) {}

  async prepareTurn(
    contact: Contact,
    rawText: string,
    recentMessages: AiChatMessage[],
  ): Promise<PreparedConversationTurn> {
    const message = this.extractCustomerText(rawText)
    const priorContext = recentMessages
      .slice(-10)
      .flatMap(item => item.content)
      .map(item => item.text || '')
      .join(' ')
    const previousState = this.read(contact)
    const existing = previousState?.inspection
    const schedulingContext =
      SCHEDULING_TERMS.test(message) ||
      SCHEDULING_TERMS.test(priorContext) ||
      !!existing

    if (!schedulingContext) {
      return {
        state: previousState,
        systemContext: this.buildSystemContext(previousState),
        deterministicReply: null,
      }
    }

    const properties = await this.prisma.properties.findMany({
      where: { company_id: contact.companies.id, status: 'available' },
      select: { id: true, title: true },
      orderBy: { id: 'desc' },
      take: 30,
    })

    const matchedProperty = properties.find(property =>
      this.normalized(message).includes(this.normalized(property.title)),
    )
    const inferredProperty =
      matchedProperty ||
      (existing?.propertyId
        ? properties.find(property => property.id === existing.propertyId)
        : undefined) ||
      (properties.length === 1 ? properties[0] : undefined)
    const day = this.extractDay(message)
    const time = this.extractTime(message)
    const email = this.extractEmail(message)

    const inspection = {
      status: (existing?.status || 'collecting_property') as InspectionStatus,
      ...(existing || {}),
      ...(inferredProperty
        ? {
            propertyId: inferredProperty.id,
            propertyTitle: inferredProperty.title,
          }
        : {}),
      ...(day || {}),
      ...(time ? { requestedTime: time } : {}),
      ...(email ? { email } : {}),
      updatedAt: new Date().toISOString(),
    }

    if (contact.crm_appointment_id) {
      inspection.status = 'booked'
    } else if (inspection.status !== 'awaiting_human') {
      inspection.status = this.nextStatus(inspection, contact)
    }

    const state: ConversationState = { version: 1, inspection }
    await this.write(contact.id, state)

    return {
      state,
      systemContext: this.buildSystemContext(state),
      deterministicReply: this.buildDeterministicReply(
        contact,
        message,
        inspection,
        properties.length,
      ),
    }
  }

  read(contact: Contact): ConversationState | null {
    const value = (contact as any).conversation_state
    if (!value || typeof value !== 'object' || value.version !== 1) return null
    return value as ConversationState
  }

  async recordAvailableSlots(
    contactId: number,
    slots: string[],
  ): Promise<void> {
    const state = await this.readById(contactId)
    if (!state?.inspection) return
    state.inspection.status = 'awaiting_confirmation'
    state.inspection.availableSlots = slots
    state.inspection.updatedAt = new Date().toISOString()
    await this.write(contactId, state)
  }

  async recordCalendarFailure(contact: Contact, reason: string): Promise<void> {
    const state = (await this.readById(contact.id)) || {
      version: 1 as const,
      inspection: {
        status: 'awaiting_human' as const,
        updatedAt: new Date().toISOString(),
      },
    }
    const alreadyEscalated = state.inspection?.status === 'awaiting_human'
    state.inspection = {
      ...(state.inspection || {
        status: 'awaiting_human' as const,
        updatedAt: new Date().toISOString(),
      }),
      status: 'awaiting_human',
      updatedAt: new Date().toISOString(),
    }
    await this.prisma.contacts.update({
      where: { id: contact.id },
      data: { conversation_state: state as any, needs_review: true },
    })
    await this.chatLifecycle.transition(contact.id, 'HUMAN_TAKEOVER', {
      reason: `Calendar handoff: ${reason}`,
      actor: 'automation',
    })
    if (!alreadyEscalated) {
      await this.sendCalendarAlert(contact, reason)
    }
  }

  async recordBooked(contactId: number, selectedDateTime: string) {
    const state = await this.readById(contactId)
    if (!state?.inspection) return
    state.inspection.status = 'booked'
    state.inspection.selectedDateTime = selectedDateTime
    state.inspection.updatedAt = new Date().toISOString()
    await this.write(contactId, state)
    await this.chatLifecycle.transition(contactId, 'INSPECTION_BOOKED', {
      reason: 'Inspection booking confirmed',
      actor: 'automation',
    })
  }

  async clearInspection(contactId: number) {
    const state = await this.readById(contactId)
    if (!state) return
    delete state.inspection
    await this.write(contactId, state)
    await this.chatLifecycle.transition(contactId, 'QUALIFYING', {
      reason: 'Inspection flow cleared or cancelled',
      actor: 'automation',
    })
  }

  buildSystemContext(state: ConversationState | null): string {
    if (!state?.inspection) return ''
    const value = state.inspection
    const facts = [
      `status=${value.status}`,
      value.propertyTitle ? `property=${value.propertyTitle}` : null,
      value.requestedDay ? `day=${value.requestedDay}` : null,
      value.requestedDate ? `date=${value.requestedDate}` : null,
      value.requestedTime ? `time=${value.requestedTime}` : null,
      value.email ? `email=${value.email}` : null,
      value.selectedDateTime
        ? `bookedDateTime=${value.selectedDateTime}`
        : null,
    ].filter(Boolean)
    return `\n## Authoritative conversation state\n${facts
      .map(item => `- ${item}`)
      .join(
        '\n',
      )}\nTreat these facts as already answered. Never ask for them again. Ask only for the next missing field. If status is awaiting_human, say the team is confirming and do not ask another question. If status is booked, confirm or close naturally and do not restart qualification or scheduling.\n`
  }

  private nextStatus(
    inspection: ConversationState['inspection'],
    contact: Contact,
  ): InspectionStatus {
    if (!inspection?.propertyTitle) return 'collecting_property'
    if (!inspection.requestedDate) return 'collecting_day'
    if (!inspection.requestedTime) return 'collecting_time'
    if (!contact.name?.trim() && !contact.whatsapp_profile_name?.trim()) {
      return 'collecting_name'
    }
    if (!inspection.email) return 'collecting_email'
    return 'checking_availability'
  }

  private buildDeterministicReply(
    contact: Contact,
    message: string,
    inspection: NonNullable<ConversationState['inspection']>,
    propertyCount: number,
  ): string | null {
    const property = inspection.propertyTitle
      ? ` for ${inspection.propertyTitle}`
      : ''
    if (inspection.status === 'awaiting_human') {
      return `I have your inspection request${property}${
        inspection.requestedDay ? ` for ${inspection.requestedDay}` : ''
      }. Our team is confirming the available time and will get back to you shortly.`
    }
    if (inspection.status === 'booked' && ACKNOWLEDGEMENT.test(message)) {
      return `You're all set${property}. If anything changes, just let me know.`
    }
    if (inspection.status === 'collecting_property') {
      return propertyCount
        ? 'Which property would you like to inspect?'
        : 'I’ve noted your inspection request. Our team will confirm the property details and available time shortly.'
    }
    if (inspection.status === 'collecting_day') {
      return `Which day works best for your inspection${property}?`
    }
    if (inspection.status === 'collecting_time') {
      return `${inspection.requestedDay} is noted${property}. What time on ${inspection.requestedDay} works best for you?`
    }
    if (inspection.status === 'collecting_name') {
      return `What name should I use for the ${inspection.requestedDay} inspection${property}?`
    }
    if (inspection.status === 'collecting_email') {
      return `Please share the email address to use for the ${inspection.requestedDay} inspection confirmation${property}.`
    }
    return null
  }

  private extractCustomerText(rawText: string): string {
    const matches = [
      ...rawText.matchAll(/<user-message>([\s\S]*?)<\/user-message>/gi),
    ]
    const selected = matches.length
      ? matches.map(match => match[1]).join(' ')
      : rawText
    return selected
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private extractDay(message: string): {
    requestedDay: string
    requestedDate: string
  } | null {
    const now = DateTime.now().setZone(this.timezone).startOf('day')
    if (/\btoday\b/i.test(message)) {
      return {
        requestedDay: now.toFormat('cccc'),
        requestedDate: now.toFormat('yyyy-MM-dd'),
      }
    }
    if (/\btomorrow\b/i.test(message)) {
      const tomorrow = now.plus({ days: 1 })
      return {
        requestedDay: tomorrow.toFormat('cccc'),
        requestedDate: tomorrow.toFormat('yyyy-MM-dd'),
      }
    }
    const match = message.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    )
    if (!match) return null
    const requestedDay =
      match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
    const weekday =
      [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ].indexOf(requestedDay) + 1
    let daysAhead = (weekday - now.weekday + 7) % 7
    if (daysAhead === 0 && !/\btoday\b/i.test(message)) daysAhead = 7
    return {
      requestedDay,
      requestedDate: now.plus({ days: daysAhead }).toFormat('yyyy-MM-dd'),
    }
  }

  private extractTime(message: string): string | null {
    const match = message.match(
      /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i,
    )
    if (!match) return null
    return `${Number(match[1])}:${match[2] || '00'} ${match[3].toUpperCase()}`
  }

  private extractEmail(message: string): string | null {
    return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null
  }

  private normalized(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  }

  private async readById(contactId: number): Promise<ConversationState | null> {
    const contact = await this.prisma.contacts.findUnique({
      where: { id: contactId },
      select: { conversation_state: true },
    })
    const value = contact?.conversation_state as any
    return value?.version === 1 ? (value as ConversationState) : null
  }

  private async write(contactId: number, state: ConversationState) {
    await this.prisma.contacts.update({
      where: { id: contactId },
      data: { conversation_state: state as any },
    })
  }

  private async sendCalendarAlert(contact: Contact, reason: string) {
    try {
      const company = contact.companies
      if (!company?.phone) return
      this.logger.warn(
        `Calendar handoff for contact ${contact.id}: ${reason || 'unavailable'}`,
      )
    } catch (error) {
      this.logger.warn(`Could not record calendar handoff: ${error?.message}`)
    }
  }
}
