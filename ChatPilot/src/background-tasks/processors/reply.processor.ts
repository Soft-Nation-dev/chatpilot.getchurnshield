import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { UnifiedMessageProcessingService } from 'src/vercel-ai/services/unified-message-processing.service'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { ContactService } from 'src/contact/contact.service'
import { AUTHOR_TYPE, Company, Contact } from 'src/utils/constants/types'
import { WhatsAppFormatter } from '../../utils/services/whatsapp-formatter.helper'
import { messages } from '@prisma/client'
import { buildDegradedReply } from '../degraded-reply'
import { sanitizeCustomerOutput } from 'src/ai-routing/customer-output-guard'
import { NotificationsService } from 'src/notifications/notifications.service'
import { ChatLifecycleService } from 'src/contact/chat-lifecycle.service'

@Processor(BackgroundQueue.REPLIES, { concurrency: 1 })
export class ReplyProcessor extends WorkerHost {
  private readonly logger = new Logger(ReplyProcessor.name)
  constructor(
    private readonly contactService: ContactService,
    private readonly messageProcessingService: UnifiedMessageProcessingService,
    private readonly WaFormattingService: WhatsAppFormatter,
    private readonly notifications: NotificationsService,
    private readonly chatLifecycle: ChatLifecycleService,
  ) {
    super()
  }
  async process(job: Job, token?: string): Promise<any> {
    const started = Date.now()
    const contact = await this.contactService.getUnProcessedMessages(
      job.data.clientId,
    )
    const contactMessagesList = contact?.messages
    const replyMessages: any = []

    if (!contact) {
      this.logger.error('Contact not found')
      return {
        messagesProcessed: contactMessagesList,
        generatedReplies: replyMessages,
      }
    }

    const latestInboundAt = contact.messages
      .filter(
        message =>
          message.author_type === AUTHOR_TYPE.HUMAN && message.sent_at,
      )
      .reduce<Date | null>((latest, message) => {
        const sentAt = message.sent_at as Date
        return !latest || sentAt > latest ? sentAt : latest
      }, null)

    // A retry must never race a person who has already taken over, or repeat a
    // response that a previous attempt partially delivered.
    if (
      job.attemptsMade > 0 &&
      latestInboundAt &&
      (await this.contactService.hasOutboundReplyAfter(
        contact.id,
        latestInboundAt,
      ))
    ) {
      this.logger.log(
        `Skipping retry for contact ${contact.id}: a newer outbound reply already exists`,
      )
      await this.contactService.markMessagesProcessed(contact)
      return { superseded: true, reason: 'newer_outbound_reply' }
    }

    const gate = await this.chatLifecycle.gate(contact.id, 'INBOUND_REPLY')
    const resetRequested = contact.messages.some(
      message =>
        message.author_type === AUTHOR_TYPE.HUMAN &&
        message.message.trim().toLowerCase() === '/reset',
    )
    if (!gate.allowed && !resetRequested) {
      await this.contactService.markMessagesProcessed(contact)
      if (contact.company_id) {
        await this.chatLifecycle.recordAutomation({
          companyId: contact.company_id,
          contactId: contact.id,
          jobType: 'reply',
          status: 'blocked',
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts || 1,
          jobId: String(job.id),
          details: { reason: gate.reason, state: gate.state },
        })
      }
      return { blocked: true, reason: gate.reason }
    }

    if (!gate.allowed && resetRequested) {
      this.logger.log(
        `Allowing explicit reset recovery for blocked contact ${contact.id}`,
      )
    }

    if (contact.company_id) {
      await this.chatLifecycle.recordAutomation({
        companyId: contact.company_id,
        contactId: contact.id,
        jobType: 'reply',
        status: job.attemptsMade > 0 ? 'retrying' : 'running',
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 1,
        jobId: String(job.id),
      })
    }

    await this.contactService.mockTypingState(contact as Contact)
    try {
      if (contact.messages.length > 0) {
        const company = contact.companies as Company
        const combinedMessages = this.formatMessage(contact.messages)
        this.logger.log(`combinedMessages: ${combinedMessages}`)

        let openAIMessage: string | null
        try {
          openAIMessage =
            await this.messageProcessingService.processClientMessage(
              contact as any,
              combinedMessages,
              contact?.companies?.id as number,
              false, // isUnauthorized
            )
        } catch (error) {
          this.logger.error(
            `All AI providers failed for contact ${contact.id}`,
            error instanceof Error ? error.stack : String(error),
          )
          const maxAttempts = job.opts.attempts || 1
          const finalAttempt = job.attemptsMade + 1 >= maxAttempts
          if (finalAttempt) {
            await this.contactService.updateContact(contact.id, {
              needs_review: true,
            })
            const hour = new Date().toISOString().slice(0, 13)
            await this.notifications.create({
              companyId: company.id,
              type: 'chat_handoff',
              severity: 'warning',
              title: 'Conversation needs a human reply',
              message:
                'The AI could not produce a reliable answer after all delayed retries. No generic reply was sent; please answer this customer from WhatsApp or the Chats dashboard.',
              entity: 'chat',
              entityId: contact.id,
              dedupeKey: `chat-handoff:${contact.id}:${hour}`,
            })
          }
          throw error
        }

        this.logger.log(`open AI Message ===> ${contact.phone} `, {
          openAIMessage,
          contactInfo: `${contact.phone}  companyPhone: ${company.phone} `,
        })
        // save message in db and also send to contact
        if (!openAIMessage) {
          await this.contactService.markMessagesProcessed(contact)
          return {
            messagesProcessed: contactMessagesList,
            generatedReplies: replyMessages,
          }
        }
        let safeReply = sanitizeCustomerOutput(openAIMessage)
        if (!safeReply) {
          this.logger.error(
            `Unsafe or empty AI reply blocked for contact ${contact.id}`,
          )
          throw new Error('AI response failed the customer-output safety check')
        }

        // A calendar failure deliberately moves the conversation to human
        // takeover during this same job. Send exactly one canonical handoff
        // message before respecting the newly closed gate, otherwise the state
        // transition itself suppresses the explanation the customer needs.
        const latestContact = await this.contactService.getContactById(contact.id)
        const terminalHandoff =
          gate.allowed &&
          (latestContact as any)?.conversation_state?.inspection?.status ===
            'awaiting_human'
        if (terminalHandoff && latestContact) {
          safeReply = buildDegradedReply(
            latestContact as Contact,
            combinedMessages,
          )
        }

        if (
          latestInboundAt &&
          (await this.contactService.hasOutboundReplyAfter(
            contact.id,
            latestInboundAt,
            false,
          ))
        ) {
          this.logger.log(
            `Suppressing AI reply for contact ${contact.id}: a team member replied while it was being generated`,
          )
          await this.contactService.markMessagesProcessed(contact)
          return { superseded: true, reason: 'human_replied_during_generation' }
        }
        const contentParts = this.WaFormattingService.splitMessage(safeReply)

        for (let i = 0; i < contentParts.length; i++) {
          const sendGate = await this.chatLifecycle.gate(
            contact.id,
            'INBOUND_REPLY',
          )
          if (!sendGate.allowed && !terminalHandoff) {
            this.logger.warn(
              `Outbound reply blocked for contact ${contact.id}: ${sendGate.reason}`,
            )
            break
          }
          if (!sendGate.allowed && terminalHandoff) {
            this.logger.log(
              `Sending final calendar handoff notice for contact ${contact.id}`,
            )
          }
          const part = contentParts[i]
          const image = this.WaFormattingService.getMarkdownImage(part)

          if (image) {
            await this.contactService.sendMessage(
              contact as Contact,
              image.alt_text,
              image.url,
            )
            replyMessages.push({
              message: image.alt_text,
              image: image.url,
            })
          } else {
            await this.contactService.sendMessage(
              contact as Contact,
              part,
              undefined,
              AUTHOR_TYPE.BOT,
            )
            replyMessages.push({ message: part })
          }
        }
        await this.contactService.markMessagesProcessed(contact)
        await this.contactService.updateContact(contact.id, {
          last_automated_message_at: new Date(),
        })
        if (contact.company_id) {
          await this.chatLifecycle.recordAutomation({
            companyId: contact.company_id,
            contactId: contact.id,
            jobType: 'reply',
            status: 'succeeded',
            attempt: job.attemptsMade + 1,
            maxAttempts: job.opts.attempts || 1,
            jobId: String(job.id),
            latencyMs: Date.now() - started,
            details: {
              messagesSent: replyMessages.length,
              degradedReply: false,
            },
          })
        }
      } else {
        this.logger.log(`message processing not required `)
      }
    } catch (error) {
      if (contact.company_id) {
        const maxAttempts = job.opts.attempts || 1
        const finalAttempt = job.attemptsMade + 1 >= maxAttempts
        await this.chatLifecycle.recordAutomation({
          companyId: contact.company_id,
          contactId: contact.id,
          jobType: 'reply',
          status: finalAttempt ? 'failed' : 'retrying',
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts || 1,
          jobId: String(job.id),
          latencyMs: Date.now() - started,
          error,
        })
      }
      throw error
    } finally {
      await this.contactService.clearTypingState(contact as Contact)
    }

    return {
      messagesProcessed: contactMessagesList,
      generatedReplies: replyMessages,
    }
  }

  formatMessage(messages: messages[]): string {
    const isIncludeCompanyReply = messages.some(
      msg => msg.author_type === AUTHOR_TYPE.USER_WHATSAPP,
    )
    const resetTriggers = ['/reset']

    const matchedReset = messages.find(msg =>
      resetTriggers.includes(msg.message.toLowerCase()),
    )

    const isResetChat = Boolean(matchedReset)
    const matchedText = matchedReset?.message || ''

    if (isResetChat) {
      return matchedText
    }
    if (isIncludeCompanyReply) {
      const lastWAUserMsgIndex =
        messages.length -
        1 -
        messages
          .slice()
          .reverse()
          .findIndex(msg => msg.author_type === AUTHOR_TYPE.USER_WHATSAPP)
      const doNotReplyMsg = messages.slice(0, lastWAUserMsgIndex + 1)
      const needToReplyMsg = messages.slice(
        lastWAUserMsgIndex + 1,
        messages.length,
      )
      return `  
      Instructions
      Ignore messages in <do-not-reply> tags — use for context only. however you can tool call on these.
       however you can save recommended treatment, save contact details other other tools calls to update context in database
      <do-not-reply>  ${this.toXmlFormat(doNotReplyMsg)} </do-not-reply>

      Respond only to messages in <probably-need-to-reply> tags.
                 <probably-need-to-reply> ${this.toXmlFormat(needToReplyMsg)} </probably-need-to-reply>`
    } else {
      return `<need-to-reply> ${this.toXmlFormat(messages)} </need-to-reply>`
    }
  }

  toXmlFormat(messages: messages[]): string {
    return messages.reduce((xml, msg) => {
      if (msg.author_type === AUTHOR_TYPE.USER_WHATSAPP) {
        return (
          xml + `<company-manual-reply>${msg.message}</company-manual-reply>`
        )
      } else if (msg.author_type === AUTHOR_TYPE.HUMAN) {
        return xml + `<user-message>${msg.message}</user-message>`
      } else {
        return xml + `<bot-message>${msg.message}</bot-message>`
      }
    }, '')
  }
}
