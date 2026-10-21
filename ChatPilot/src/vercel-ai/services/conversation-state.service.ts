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
  memory?: {
    activePropertyId?: number
    activePropertyTitle?: string
    activePropertyLocation?: string
    brief?: string
    sentMedia?: Array<{
      propertyId: number
      url: string
      sentAt: string
    }>
    updatedAt: string
  }
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
const DIRECT_SCHEDULING_REQUEST =
  /\b(?:book|schedule|arrange|set\s*up|request|want|would\s+like|ready)\b[\s\S]{0,50}\b(?:appointment|inspection|viewing|visit|come\s+(?:and\s+)?see)\b|\b(?:appointment|inspection|viewing|visit)\b[\s\S]{0,35}\b(?:book|schedule|arrange|available|when|day|time)\b/i
const FLOW_STATUS_QUERY =
  /\b(?:already|agreed|confirm(?:ed|ation)?|status|pending|booked|saved)\b/i
const ACKNOWLEDGEMENT =
  /^(?:yes|yeah|yep|ok(?:ay)?|alright|sure|thanks?|thank you|noted|perfect|great|that works)(?:[\s!.]|$)/i
const PROPERTY_MEDIA_REQUEST =
  /\b(?:send|show|share|see|view|resend|need|want|love|have|get)\b[\s\S]{0,55}\b(?:pic|pics|photo|photos|picture|pictures|image|images|media)\b|\b(?:pic|pics|photo|photos|picture|pictures|image|images|media)\b[\s\S]{0,45}\b(?:again|more|send|show|share|see|view|pls|please|kindly|now)\b|^(?:the\s+|some\s+)?(?:pic|pics|photo|photos|picture|pictures|image|images|media)(?:\s+(?:pls|please|kindly|again|now))?[?.!]*$/i

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
    _recentMessages: AiChatMessage[],
  ): Promise<PreparedConversationTurn> {
    const message = this.extractCustomerText(rawText)
    let previousState = this.read(contact)
    const resumedAfterHandoff =
      previousState?.inspection?.status === 'awaiting_human' &&
      (contact as any).chat_state !== 'HUMAN_TAKEOVER' &&
      (contact as any).is_replies_activated === true

    // Older/manual resume paths could reactivate replies without clearing the
    // terminal calendar handoff marker. Reconcile that inconsistent state on
    // the first new message so an already reopened chat cannot keep replaying
    // the handoff notice.
    if (resumedAfterHandoff) {
      previousState = {
        version: 1,
        ...(previousState?.memory ? { memory: previousState.memory } : {}),
      }
      await this.write(contact.id, previousState)
      this.logger.log(
        `Cleared stale awaiting_human state for resumed contact ${contact.id}`,
      )
    }

    const recalledMedia = await this.recallPropertyMedia(
      contact,
      message,
      previousState,
    )
    if (recalledMedia) return recalledMedia

    const existing = this.isActive(previousState?.inspection)
      ? previousState?.inspection
      : undefined
    const directSchedulingRequest = DIRECT_SCHEDULING_REQUEST.test(message)

    if (previousState?.inspection && !existing) {
      const clearedState: ConversationState = {
        version: 1,
        ...(previousState.memory ? { memory: previousState.memory } : {}),
      }
      await this.write(contact.id, clearedState)
      if (!directSchedulingRequest) {
        return {
          state: clearedState,
          systemContext: '',
          deterministicReply: null,
        }
      }
    }

    if (!existing && !directSchedulingRequest) {
      return {
        state: previousState?.inspection ? { version: 1 } : previousState,
        systemContext: previousState?.inspection
          ? ''
          : this.buildSystemContext(previousState),
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
    const answersCurrentField =
      (!!existing &&
        existing.status === 'collecting_property' &&
        !!matchedProperty) ||
      (!!existing && existing.status === 'collecting_day' && !!day) ||
      (!!existing && existing.status === 'collecting_time' && !!time) ||
      (!!existing && existing.status === 'collecting_email' && !!email)
    const asksAboutCurrentFlow =
      !!existing &&
      (existing.status === 'awaiting_human' || existing.status === 'booked') &&
      (SCHEDULING_TERMS.test(message) || FLOW_STATUS_QUERY.test(message))

    // A pending inspection is context, not permission to hijack every future
    // customer message. Let the LLM answer side questions (for example, asking
    // what other properties are available) without replaying the missing-field
    // prompt. The deterministic flow resumes only when the customer advances it
    // or explicitly returns to scheduling.
    if (
      existing &&
      !directSchedulingRequest &&
      !answersCurrentField &&
      !asksAboutCurrentFlow &&
      !(existing.status === 'booked' && ACKNOWLEDGEMENT.test(message))
    ) {
      return {
        state: previousState,
        systemContext: this.buildSystemContext(previousState),
        deterministicReply: null,
      }
    }

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

    const state: ConversationState = {
      version: 1,
      ...(previousState?.memory ? { memory: previousState.memory } : {}),
      inspection,
    }
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

  async recordPropertyMedia(
    contactId: number,
    property: { id: number; title: string; location?: string | null },
    urls: string[],
  ) {
    const state = (await this.readById(contactId)) || { version: 1 as const }
    const sentMedia = [...(state.memory?.sentMedia || [])]
    const now = new Date().toISOString()
    for (const url of urls) {
      const existing = sentMedia.find(
        item => item.propertyId === property.id && item.url === url,
      )
      if (existing) existing.sentAt = now
      else sentMedia.push({ propertyId: property.id, url, sentAt: now })
    }
    state.memory = {
      ...(state.memory || { updatedAt: now }),
      activePropertyId: property.id,
      activePropertyTitle: property.title,
      activePropertyLocation: property.location || undefined,
      sentMedia: sentMedia.slice(-12),
      updatedAt: now,
    }
    await this.write(contactId, state)
  }

  async recordExchange(
    contactId: number,
    customerMessage: string,
    assistantReply: string,
  ) {
    const state = (await this.readById(contactId)) || { version: 1 as const }
    const customer = this.compact(
      this.extractCustomerText(customerMessage),
      240,
    )
    const assistant = this.compact(
      assistantReply.replace(/!\[[^\]]*\]\([^)]*\)/g, '[property media sent]'),
      240,
    )
    const brief = [
      customer ? `Latest customer request: ${customer}` : null,
      assistant ? `Latest assistant response: ${assistant}` : null,
    ]
      .filter(Boolean)
      .join(' ')
    state.memory = {
      ...(state.memory || { updatedAt: new Date().toISOString() }),
      brief,
      updatedAt: new Date().toISOString(),
    }
    await this.write(contactId, state)
  }

  buildSystemContext(state: ConversationState | null): string {
    if (!state?.inspection && !state?.memory) return ''
    const value = state?.inspection
    const memory = state?.memory
    const facts = [
      value ? `inspection_status=${value.status}` : null,
      value?.propertyTitle
        ? `inspection_property=${value.propertyTitle}`
        : null,
      value?.requestedDay ? `inspection_day=${value.requestedDay}` : null,
      value?.requestedDate ? `inspection_date=${value.requestedDate}` : null,
      value?.requestedTime ? `inspection_time=${value.requestedTime}` : null,
      value?.email ? `inspection_email=${value.email}` : null,
      value?.selectedDateTime
        ? `bookedDateTime=${value.selectedDateTime}`
        : null,
      memory?.activePropertyTitle
        ? `active_property=${memory.activePropertyTitle}`
        : null,
      memory?.activePropertyLocation
        ? `active_property_location=${memory.activePropertyLocation}`
        : null,
      memory?.sentMedia?.length
        ? `property_media_already_sent=${memory.sentMedia.length}`
        : null,
    ].filter(Boolean)
    const brief = memory?.brief ? `\n- ${memory.brief}` : ''
    return `\n## Compact persistent chat context\n${facts
      .map(item => `- ${item}`)
      .join(
        '\n',
      )}${brief}\nThis compact context survives the short transcript window. Treat it as authoritative, resolve words such as “it”, “that property”, and “the pictures” against active_property, and never ask the customer to repeat a saved fact. Answer the latest question first. If the customer asks for the same property's pictures again, use the remembered property and send_property_media rather than restarting qualification. A pending inspection is context, not a command to ignore the latest message. If the message does not supply the next missing scheduling field, do not repeat that field's question in this turn. If the customer asks about other listings or availability, use search_inventory and answer that before returning to scheduling. Never send the same question on consecutive assistant turns. If inspection_status is awaiting_human, say the team is confirming only when the customer asks about that request; otherwise answer their new question. If inspection_status is booked, confirm or close naturally and do not restart qualification or scheduling.\n`
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

  private async recallPropertyMedia(
    contact: Contact,
    message: string,
    initialState: ConversationState | null,
  ): Promise<PreparedConversationTurn | null> {
    if (!PROPERTY_MEDIA_REQUEST.test(message)) return null
    let state = initialState
    let propertyId = state?.memory?.activePropertyId
    let recoveredProperty: {
      id: number
      title: string
      location: string | null
      image_urls: string | null
    } | null = null
    if (!propertyId) {
      const lastMedia = await this.prisma.messages.findFirst({
        where: {
          contact_id: contact.id,
          author_type: 'bot',
          image_url: { not: null },
        },
        orderBy: { sent_at: 'desc' },
        select: { image_url: true },
      })
      if (lastMedia?.image_url) {
        recoveredProperty = await this.prisma.properties.findFirst({
          where: {
            company_id: contact.companies.id,
            status: 'available',
            image_urls: { contains: lastMedia.image_url },
          },
          select: { id: true, title: true, location: true, image_urls: true },
        })
        if (recoveredProperty) {
          propertyId = recoveredProperty.id
          await this.recordPropertyMedia(contact.id, recoveredProperty, [
            lastMedia.image_url,
          ])
          state = await this.readById(contact.id)
        }
      }
    }
    if (!propertyId) return null
    const property =
      recoveredProperty ||
      (await this.prisma.properties.findFirst({
        where: {
          id: propertyId,
          company_id: contact.companies.id,
          status: 'available',
        },
        select: { id: true, title: true, location: true, image_urls: true },
      }))
    if (!property) return null
    const images = this.mediaUrls(property.image_urls)
    if (!images.length) return null
    const alreadySent = new Set(
      (state?.memory?.sentMedia || [])
        .filter(item => item.propertyId === property.id)
        .map(item => item.url),
    )
    const plural = /\b(?:pics|photos|pictures|images|media|more)\b/i.test(message)
    const limit = plural ? 3 : 1
    const unsent = images.filter(url => !alreadySent.has(url))
    const selected = (unsent.length ? unsent : images).slice(0, limit)
    await this.recordPropertyMedia(contact.id, property, selected)
    const refreshed = await this.readById(contact.id)
    return {
      state: refreshed,
      systemContext: this.buildSystemContext(refreshed),
      deterministicReply: selected
        .map(
          (url, index) =>
            `![${property.title}${selected.length > 1 ? ` — photo ${index + 1}` : ''}](${url})`,
        )
        .join('\n\n'),
    }
  }

  private mediaUrls(value?: string | null): string[] {
    if (!value?.trim()) return []
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(url => /^https:\/\//i.test(url))
      }
    } catch {
      // Older property rows use comma or newline separated URLs.
    }
    return value
      .split(/[\n,]+/)
      .map(url => url.trim())
      .filter(url => /^https:\/\//i.test(url))
  }

  private compact(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, max)
  }

  private isActive(
    inspection: ConversationState['inspection'],
  ): inspection is NonNullable<ConversationState['inspection']> {
    if (!inspection) return false
    if (inspection.status === 'booked') return true
    const updatedAt = Date.parse(inspection.updatedAt)
    if (!Number.isFinite(updatedAt)) return false
    const configuredHours = Number(
      process.env.CONVERSATION_STATE_TTL_HOURS || 48,
    )
    const ttlHours =
      Number.isFinite(configuredHours) && configuredHours > 0
        ? configuredHours
        : 48
    return Date.now() - updatedAt <= ttlHours * 60 * 60 * 1000
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
