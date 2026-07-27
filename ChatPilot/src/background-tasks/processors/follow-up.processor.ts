import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { PrismaService } from 'src/prisma/prisma.service'
import { ContactService } from 'src/contact/contact.service'
import { AiGoogleService } from 'src/vercel-ai/services/ai-google.service'
import { Contact } from 'src/utils/constants/types'
import { WhatsAppFormatter } from 'src/utils/services/whatsapp-formatter.helper'

const FOLLOW_UP_STAGE_HOURS = (process.env.FOLLOW_UP_STAGE_HOURS || '24,72')
  .split(',')
  .map(v => Number(v.trim()))
  .filter(v => Number.isFinite(v) && v > 0)

const FOLLOW_UP_SYSTEM_PROMPT = `You are a follow-up assistant. Your job is to write a short, friendly follow-up message to a contact who hasn't replied in a while.

Rules:
- Write ONE short follow-up message (1-3 sentences max)
- Be warm and natural, not pushy or salesy
- Reference the previous conversation context naturally
- Do NOT repeat information already shared
- Do NOT ask multiple questions — just one gentle nudge
- Write in the same language the contact was using
- If the conversation ended naturally (e.g. the contact said goodbye), do NOT send a follow-up. Instead respond with exactly: NO_FOLLOW_UP`

const FOLLOW_UP_SYSTEM_PROMPT_FINAL = `You are a follow-up assistant. This is the FINAL gentle check-in with a contact who has not replied for several days.

Rules:
- Write ONE short message (1-3 sentences max)
- Be warm and low-pressure — this is the last time we reach out
- Offer exactly one of two clear next steps: booking a site inspection, or being connected with a human agent
- Do NOT repeat information already shared
- Write in the same language the contact was using
- If the conversation ended naturally (e.g. the contact said goodbye or said they are no longer interested), do NOT send anything. Instead respond with exactly: NO_FOLLOW_UP`

@Processor(BackgroundQueue.FOLLOW_UP, { concurrency: 1 })
export class FollowUpProcessor extends WorkerHost {
  private readonly logger = new Logger(FollowUpProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactService: ContactService,
    private readonly aiGoogleService: AiGoogleService,
    private readonly waFormattingService: WhatsAppFormatter,
  ) {
    super()
  }

  async process(job: Job): Promise<any> {
    this.logger.log('Starting follow-up check')

    if (!FOLLOW_UP_STAGE_HOURS.length) {
      this.logger.log('No follow-up stages configured, skipping')
      return { checked: 0, sent: 0 }
    }

    const cutoffDate = new Date(
      Date.now() - Math.min(...FOLLOW_UP_STAGE_HOURS) * 60 * 60 * 1000,
    )

    // Find contacts that need a follow-up
    const contacts = await this.prisma.contacts.findMany({
      where: {
        follow_up_stage: { lt: FOLLOW_UP_STAGE_HOURS.length },
        is_bot_activated: true,
        is_replies_activated: true,
        crm_appointment_id: null,
        last_message_received: { lt: cutoffDate },
      },
      include: {
        companies: true,
        messages: {
          orderBy: { sent_at: 'desc' },
          take: 1,
        },
      },
    })

    // Filter: only contacts where the last message was from the bot (not the user)
    const needsFollowUp = contacts.filter(contact => {
      if (!contact.messages.length) return false
      if (!contact.companies?.is_bot_activated) return false
      const lastMsg = contact.messages[0]
      if (lastMsg.author_type !== 'bot') return false
      const dueHours = FOLLOW_UP_STAGE_HOURS[contact.follow_up_stage]
      if (dueHours === undefined) return false
      return (
        contact.last_message_received.getTime() <
        Date.now() - dueHours * 60 * 60 * 1000
      )
    })

    this.logger.log(`Found ${needsFollowUp.length} contacts needing follow-up`)

    let sent = 0
    for (const contact of needsFollowUp) {
      try {
        await this.sendFollowUp(contact as unknown as Contact)
        sent++
      } catch (error) {
        this.logger.error(
          `Failed to send follow-up to contact ${contact.id}`,
          error,
        )
      }
    }

    this.logger.log(
      `Follow-up check complete. Sent: ${sent}/${needsFollowUp.length}`,
    )
    return { checked: needsFollowUp.length, sent }
  }

  private async sendFollowUp(contact: Contact): Promise<void> {
    const chatHistory = await this.contactService.getAiChatHistory(
      contact.id,
      true,
    )

    if (chatHistory.length === 0) return

    // Build a prompt with the last few messages for context
    const recentMessages = chatHistory.slice(-10)
    const chatSummary = recentMessages
      .map(msg => `${msg.role}: ${msg.content[0]?.text}`)
      .join('\n')

    const stage = contact.follow_up_stage ?? 0
    const isFinalStage = stage >= FOLLOW_UP_STAGE_HOURS.length - 1
    const dueHours = FOLLOW_UP_STAGE_HOURS[stage] ?? FOLLOW_UP_STAGE_HOURS[0]

    const prompt = `Here is the recent conversation with the contact:\n\n${chatSummary}\n\nThe contact has not replied for over ${dueHours} hours. Write a follow-up message.`

    const { text } = await this.aiGoogleService.processPrompts(
      contact,
      isFinalStage ? FOLLOW_UP_SYSTEM_PROMPT_FINAL : FOLLOW_UP_SYSTEM_PROMPT,
      prompt,
    )

    if (!text || text.trim() === 'NO_FOLLOW_UP') {
      this.logger.log(
        `No follow-up needed for contact ${contact.id} (conversation ended naturally)`,
      )
      await this.contactService.updateContact(contact.id, {
        follow_up_stage: FOLLOW_UP_STAGE_HOURS.length,
        is_follow_up_sent: true,
      })
      return
    }

    const contentParts = this.waFormattingService.splitMessage(text)
    for (const part of contentParts) {
      await this.contactService.sendMessage(contact, part)
    }

    await this.contactService.updateContact(contact.id, {
      follow_up_stage: stage + 1,
      last_follow_up_at: new Date(),
      is_follow_up_sent: true,
    })
    this.logger.log(
      `Follow-up sent to contact ${contact.id} (stage ${stage + 1}/${FOLLOW_UP_STAGE_HOURS.length})`,
    )
  }
}
