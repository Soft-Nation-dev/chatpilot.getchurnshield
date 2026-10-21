import { Injectable, Logger } from '@nestjs/common'
import { ContactService } from 'src/contact/contact.service'
import { Contact } from 'src/utils/constants/types'
import { AiGoogleService } from 'src/vercel-ai/services/ai-google.service'
import { ConversationStateService } from './conversation-state.service'
import { ChatLifecycleService } from 'src/contact/chat-lifecycle.service'

@Injectable()
export class UnifiedMessageProcessingService {
  private readonly logger = new Logger(UnifiedMessageProcessingService.name)

  constructor(
    private readonly AiGeminiService: AiGoogleService,
    private readonly contactService: ContactService,
    private readonly conversationStateService: ConversationStateService,
    private readonly chatLifecycle: ChatLifecycleService,
  ) {}

  async processClientMessage(
    contact: Contact,
    text: string,
    companyId: number,
    isUnauthorized: boolean,
  ): Promise<string | null> {
    this.logger.log(`contact: ${contact}`)
    if (isUnauthorized) {
      return `Please make sure you are using the same phone number registered on your chatpilot account, or contact our support team for assistance.`
    }

    // Reset is an explicit customer recovery command. It must be handled before
    // lifecycle gating so a paused, handed-over, or closed test conversation can
    // be deliberately restarted instead of remaining permanently silent.
    if (text.toLowerCase().includes('/reset')) {
      await this.contactService.archiveContact(contact.id)
      return `Perfect! You have successfully restarted the conversation. Now you can start again and send your next question or message. I'm here to help!`
    }

    const gate = await this.chatLifecycle.gate(contact.id, 'INBOUND_REPLY')
    if (!gate.allowed) {
      this.logger.warn(
        `LLM call blocked for contact ${contact.id}: ${gate.reason}`,
      )
      return null
    }

    this.logger.log(`text: ${text}`)

    const updatedContact = await this.contactService.updateContact(contact.id, {
      last_message_received: new Date(),
      total_messages: { increment: 1 } as any,
    })
    this.logger.log(`updatedContact: ${updatedContact}`)

    // total_messages is an analytics counter, not a customer quota. Context is
    // already bounded by getAiChatHistoryMultimodal and the compact persistent
    // conversation state, so long-running chats must continue normally instead
    // of leaking an internal limit/reset instruction to the customer.

    this.logger.log(`Routing AI request for company ${companyId}`)

    // Use original contact with companies relation, update total_messages
    const contactWithCompanies = {
      ...contact,
      ...updatedContact,
      companies: contact.companies,
    } as Contact

    const chatHistory = await this.contactService.getAiChatHistoryMultimodal(
      contact.id,
      true,
    )
    const preparedTurn = await this.conversationStateService.prepareTurn(
      contactWithCompanies,
      text,
      chatHistory,
    )
    chatHistory.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text,
        },
      ],
    })

    if (preparedTurn.deterministicReply) {
      this.logger.log(
        `Conversation state handled scheduling turn for contact ${contact.id}`,
      )
      await this.conversationStateService.recordExchange(
        contact.id,
        text,
        preparedTurn.deterministicReply,
      )
      return preparedTurn.deterministicReply
    }

    const response = await this.AiGeminiService.processMessage(
      contactWithCompanies,
      chatHistory,
      preparedTurn.systemContext,
    )

    await this.conversationStateService.recordExchange(
      contact.id,
      text,
      response.text,
    )

    return response.text
  }
}
