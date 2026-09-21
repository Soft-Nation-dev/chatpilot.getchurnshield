import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateCompanyDto } from '../company/dto/create-company.dto'
import { companies, contacts, messages, Prisma } from '@prisma/client'
import {
  AUTHOR_TYPE,
  AiChatMessage,
  Company,
  Contact,
  ORIGINAL_MESSAGE_TYPE,
} from 'src/utils/constants/types'
import { WhatsBaileyService } from 'src/utils/services/whats-bailey.service'
import {
  decryptMessage,
  decryptMessagesInPlace,
  encryptMessage,
} from 'src/common/crypto/message-crypto'
import { encryptContactFields } from 'src/common/crypto/contact-crypto'

const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  pdf: 'application/pdf',
}

function inferMediaType(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  const ext = clean.split('.').pop()?.toLowerCase() ?? ''
  return MEDIA_TYPE_BY_EXTENSION[ext] ?? 'image/jpeg'
}

const QUALIFICATION_FIELDS = [
  'budget_min',
  'budget_max',
  'budget_currency',
  'budget_raw',
  'property_type',
  'preferred_location',
  'bedrooms',
  'title_preference',
  'purchase_timeline',
  'payment_plan',
  'qualification_notes',
  'qual_stage',
  'lead_score',
]

const BIGINT_QUALIFICATION_FIELDS = ['budget_min', 'budget_max']

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsBailey: WhatsBaileyService,
  ) {}

  async createContact(createContactDto: CreateCompanyDto) {
    return await this.prisma.contacts.create({
      data: {
        ...createContactDto,
      },
      include: {
        companies: true,
      },
    })
  }

  async getContactById(id: number): Promise<Contact> {
    return (await this.prisma.contacts.findUnique({
      where: { id },
      include: {
        companies: true,
      },
    })) as Contact
  }

  async updateContact(id: number, updateContactDto: Partial<contacts | any>) {
    return await this.prisma.contacts.update({
      where: { id },
      data: {
        ...updateContactDto,
      },
      include: {
        companies: true,
      },
    })
  }

  async sendMessageToCompany(contact: Contact, text: string): Promise<void> {
    const company = contact.companies
    await this._sendMessage(contact, Number(company.phone), text)
  }

  async archiveContact(contactId: number) {
    await Promise.all([
      this.resetContact(contactId),
      this.prisma.messages.deleteMany({ where: { contact_id: contactId } }),
    ])
  }

  async markMessagesProcessed(
    contact: contacts & {
      messages: messages[]
    },
  ) {
    const messageIds: number[] = contact.messages.map(
      (message: messages) => message.id,
    )
    return await this.prisma.messages.updateMany({
      where: { id: { in: messageIds } },
      data: {
        processed: true,
      },
    })
  }

  async getUnProcessedMessages(contactId: number): Promise<
    | (contacts & {
        companies: companies | null
        messages: messages[]
      })
    | null
  > {
    const contact = await this.prisma.contacts.findFirst({
      where: { id: contactId },
      include: {
        companies: true,
        messages: {
          where: {
            processed: false,
          },
          orderBy: { sent_at: 'asc' },
        },
      },
    })
    if (contact?.messages?.length) {
      decryptMessagesInPlace(contact.messages)
    }
    return contact
  }

  async deleteContact(id: number) {
    return await this.prisma.contacts.delete({
      where: { id },
    })
  }

  async sendMessage(
    self: Contact,
    text: string,
    mediaUrl?: string,
    authorType: AUTHOR_TYPE = AUTHOR_TYPE.BOT,
    source?: string,
  ): Promise<void> {
    const originalMessageType = mediaUrl
      ? ORIGINAL_MESSAGE_TYPE.IMAGE
      : ORIGINAL_MESSAGE_TYPE.TEXT
    const isFromLid = !self.phone && !!self.lid
    const sendNumber = self.phone ? Number(self.phone) : Number(self.lid)
    const wbId = await this._sendMessage(
      self,
      sendNumber,
      text,
      mediaUrl,
      isFromLid,
    )
    await this.saveOutgoingMessage(
      self,
      text,
      mediaUrl,
      authorType,
      originalMessageType,
      wbId,
    )
  }

  async saveOutgoingMessage(
    self: contacts & {
      companies?: companies
    },
    text: string,
    imageUrl: string | null = null,
    authorType: AUTHOR_TYPE = AUTHOR_TYPE.BOT,
    originalMessageType: ORIGINAL_MESSAGE_TYPE = ORIGINAL_MESSAGE_TYPE.TEXT,
    wbId: string | null = null,
  ): Promise<void> {
    await this.prisma.messages.create({
      data: {
        contact_id: self.id,
        message: encryptMessage(text),
        image_url: imageUrl,
        message_type: imageUrl ? 'image' : 'text',
        author_type: authorType,
        processed: authorType === AUTHOR_TYPE.BOT ? true : false,
        original_message_type: originalMessageType,
        wb_id: wbId,
      },
    })
  }

  private async _sendMessage(
    self: Contact,
    phone: number,
    text: string,
    imageUrl?: string,
    isFromLid: boolean = false,
  ): Promise<string | null> {
    const company: Company = self.companies

    if (company) {
      return await this.whatsBailey.sendMessage(
        company,
        phone,
        text,
        imageUrl,
        undefined,
        isFromLid,
      )
    }
    return null
  }

  async getAiChatHistory(
    contactId: number,
    onlyProcessed: boolean = false,
  ): Promise<AiChatMessage[]> {
    const messages = await this.getRecentMessages(contactId, onlyProcessed)
    const chatHistory = messages.map(msg => ({
      role: msg.author_type === AUTHOR_TYPE.HUMAN ? 'user' : 'assistant',
      content: [
        {
          type: 'text',
          text: msg.message,
        },
      ],
    }))
    return chatHistory
  }

  async getAiChatHistoryMultimodal(
    contactId: number,
    onlyProcessed: boolean = false,
  ): Promise<AiChatMessage[]> {
    const messages = await this.getRecentMessages(contactId, onlyProcessed)
    const budget = Number(process.env.AI_MAX_IMAGE_PARTS || 4)

    const attachable = new Set<number>()
    if (budget > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (attachable.size >= budget) break
        const msg = messages[i]
        if (msg.author_type === AUTHOR_TYPE.HUMAN && msg.image_url) {
          attachable.add(msg.id)
        }
      }
    }

    return messages.map(msg => {
      const role = msg.author_type === AUTHOR_TYPE.HUMAN ? 'user' : 'assistant'
      const isImage = role === 'user' && !!msg.image_url
      const attached = isImage && attachable.has(msg.id)

      const content: AiChatMessage['content'] = [
        {
          type: 'text',
          text:
            isImage && !attached
              ? `${msg.message}\n[image previously sent: ${msg.image_url}]`
              : msg.message,
        },
      ]

      if (attached) {
        content.push({
          type: 'file',
          data: new URL(msg.image_url as string),
          mediaType: inferMediaType(msg.image_url as string),
        })
      }

      return { role, content }
    })
  }

  async getAllMessages(contactId: number, onlyProcessed: boolean = false) {
    const messages = await this.prisma.messages.findMany({
      where: {
        contact_id: contactId,
        ...(onlyProcessed ? { processed: onlyProcessed } : {}),
      },
      orderBy: {
        sent_at: 'asc',
      },
    })
    return decryptMessagesInPlace(messages)
  }

  private async getRecentMessages(
    contactId: number,
    onlyProcessed: boolean = false,
  ) {
    const configured = Number(process.env.AI_MAX_HISTORY_MESSAGES || 12)
    const limit = Number.isFinite(configured)
      ? Math.max(4, Math.min(30, Math.floor(configured)))
      : 12
    const messages = await this.prisma.messages.findMany({
      where: {
        contact_id: contactId,
        ...(onlyProcessed ? { processed: onlyProcessed } : {}),
      },
      orderBy: { sent_at: 'desc' },
      take: limit,
    })
    messages.reverse()
    return decryptMessagesInPlace(messages)
  }

  async saveIncomingMessage(
    self: contacts,
    text: string,
    originalMessageType: ORIGINAL_MESSAGE_TYPE = ORIGINAL_MESSAGE_TYPE.TEXT,
    wbId: string | null = null,
    imageUrl: string | null = null,
  ): Promise<messages> {
    const message = await this.prisma.messages.create({
      data: {
        contact_id: self.id,
        sender_phone: self.phone,
        message: encryptMessage(text),
        author_type: AUTHOR_TYPE.HUMAN,
        original_message_type: originalMessageType,
        wb_id: wbId,
        image_url: imageUrl,
        message_type: imageUrl ? 'image' : 'text',
      },
    })
    return message
  }

  async getOrCreateContact(
    company: companies,
    phone: number | null,
    senderName: string | null = null,
    userlid: bigint | null = null,
    isFromLid: boolean = false,
  ): Promise<Contact | null> {
    try {
      // If we have phone but no LID, fetch LID from WB API
      if (!isFromLid && phone != null && userlid == null) {
        try {
          userlid = await this.whatsBailey.getLid(
            company as any,
            phone.toString(),
          )
        } catch {
          // LID lookup failed, continue without it
        }
      }

      // Build where clause: search by LID if isFromLid, otherwise by phone (with optional LID match)
      const whereClause: any = isFromLid
        ? { lid: userlid, company_id: company.id }
        : userlid != null
          ? {
              OR: [
                { phone: phone, company_id: company.id },
                { lid: userlid, company_id: company.id },
              ],
            }
          : { phone: phone, company_id: company.id }

      const contact = await this.prisma.contacts.findFirst({
        where: whereClause,
        include: {
          companies: true,
        },
      })

      if (!contact) {
        this.logger.log('creating company contact')
        // isFromLid → phone=null, only store LID
        const newContact = await this.prisma.contacts.create({
          data: {
            phone: isFromLid ? null : phone,
            company_id: company.id,
            whatsapp_profile_name: senderName,
            lid: userlid,
          },
          include: {
            companies: true,
          },
        })
        return newContact as Contact
      }

      // Merge: fill in missing phone or LID on existing contact
      const updateData: any = {}
      if (contact.phone == null && phone != null && !isFromLid) {
        updateData.phone = phone
      }
      if (contact.lid == null && userlid != null) {
        updateData.lid = userlid
      }
      if (Object.keys(updateData).length > 0) {
        const updated = await this.prisma.contacts.update({
          where: { id: contact.id },
          data: updateData,
          include: {
            companies: true,
          },
        })
        return updated as Contact
      }

      return contact as Contact
    } catch (e) {
      return null
    }
  }

  async updateField(
    contact: contacts,
    field: keyof Prisma.contactsUpdateInput,
    value: string | number | boolean,
  ): Promise<string> {
    const allowedFields = [
      'name',
      'property_type',
      'preferred_location',
      'title_preference',
      'purchase_timeline',
      'payment_plan',
      'qual_stage',
      'source',
    ]

    if (!allowedFields.includes(field as string)) {
      return `Invalid field: ${field}`
    }

    try {
      await this.prisma.contacts.update({
        where: { id: contact.id },
        data: {
          [field]: value,
        },
      })
      return 'success'
    } catch (error) {
      return 'Failed to update contact'
    }
  }

  async updateQualification(
    contact: contacts,
    patch: Record<string, any>,
  ): Promise<string> {
    const data: Record<string, any> = {}

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null) continue
      if (!QUALIFICATION_FIELDS.includes(key)) continue
      if (BIGINT_QUALIFICATION_FIELDS.includes(key)) {
        const numeric = Number(value)
        if (!Number.isFinite(numeric) || numeric < 0) continue
        data[key] = BigInt(Math.round(numeric))
        continue
      }
      data[key] = value
    }

    if (!Object.keys(data).length) {
      return 'No valid qualification fields provided'
    }

    try {
      await this.prisma.contacts.update({
        where: { id: contact.id },
        data: encryptContactFields(data),
      })
      return 'success'
    } catch (error) {
      this.logger.error('Failed to update qualification', error?.message)
      return 'Failed to update contact'
    }
  }

  async appendQualificationNotes(
    contact: contacts,
    notes: string,
  ): Promise<string> {
    const current = await this.prisma.contacts.findUnique({
      where: { id: contact.id },
      select: { qualification_notes: true },
    })

    const existing = current?.qualification_notes
      ? decryptMessage(current.qualification_notes)
      : ''
    const merged = existing ? `${existing}\n${notes}` : notes

    return this.updateQualification(contact, { qualification_notes: merged })
  }

  async mockTypingState(self: Contact): Promise<void> {
    try {
      const company: Company = self.companies

      if (company) {
        await this.whatsBailey.mockTypingState(self)
      }
    } catch (e) {
      this.logger.error(`error while mocking typing status: `, {
        companyPhone: self.companies?.phone,
        contact: self,
      })
      return
    }
  }

  async clearTypingState(self: Contact): Promise<void> {
    const company: Company = self.companies
    try {
      if (company) {
        await this.whatsBailey.clearTypingState(self)
      }
    } catch (e) {
      this.logger.error(`error while clearing typing status: `, {
        companyPhone: company.phone,
        contact: self,
      })
      return
    }
  }

  async resetContact(contactId: number) {
    await this.prisma.$queryRaw`
  UPDATE "contacts"
  SET
    schedule_event = NULL,
    last_message_received = NOW(),
    total_messages = 0,
    needs_review = FALSE,
    is_bot_activated = TRUE,
    is_replies_activated = TRUE,
    is_follow_up_sent = FALSE,
    crm_appointment_at = NULL,
    crm_appointment_id = NULL,
    contact_stop_date = NULL
  WHERE id = ${contactId};
`
  }

  async resetFollowUps(contactId: number) {
    const updatedContact = await this.updateContact(contactId, {
      last_message_received: new Date(),
      is_follow_up_sent: false,
      follow_up_stage: 0,
      contact_stop_date: null,
    })
    return updatedContact
  }

  async markUnread(_contact: Contact) {
    // markUnread not supported in WhatsApp Bailey
  }

  async markOutgoingMessageRead(wbId: string) {
    return this.prisma.messages.updateMany({
      where: { wb_id: wbId },
      data: { is_read: true },
    })
  }
}
