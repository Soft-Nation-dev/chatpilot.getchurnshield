import { Injectable, Logger } from '@nestjs/common'
import { LanguageModelUsage } from 'ai'
import { AiChatMessage, Company, Contact } from 'src/utils/constants/types'
import { DatesHelper } from 'src/utils/services/dates.service'
import { ModelKey, ProviderKey } from 'src/common/logging/getModel'
import { AiAssistantConfigService } from './ai-assistant-config.service'
import { AiRoutingService } from 'src/ai-routing/ai-routing.service'
import { AiWorkload } from 'src/ai-routing/ai-routing.types'
import { decryptContactFields } from 'src/common/crypto/contact-crypto'

@Injectable()
export class AiGoogleService {
  private readonly logger = new Logger(AiGoogleService.name)

  constructor(
    private readonly datesHelper: DatesHelper,
    private readonly aiAssistantConfigService: AiAssistantConfigService,
    private readonly aiRoutingService: AiRoutingService,
  ) {}

  /**
   * Used to Process a user message and return a response
   */
  async processMessage(
    contact: Contact,
    chatHistory: AiChatMessage[],
  ): Promise<{
    text: string
    usage: LanguageModelUsage
    model: ModelKey
    provider: ProviderKey
  }> {
    const company = contact.companies as Company
    const assistant = await this.aiAssistantConfigService.getAssistantConfig(
      contact,
      chatHistory,
    )

    try {
      if (!assistant) {
        throw new Error('Assistant not found')
      }

      this.logger.log('ai-sdk start Processing message', {
        context: 'processMessage',
        parameters: {
          contactId: contact.id,
          contactPhone: contact.phone,
          companyId: contact.companies.id,
          companyPhone: contact.companies.phone,
          chatHistoryLength: chatHistory,
          assistantId: company.assistant_id,
          assistantModel: 'routed',
        },
      })

      const nowInCompanyTimezone = this.datesHelper.localNow()
      const systemPrompt = `${assistant.systemPrompt}
      ${this.buildLeadMemory(contact)}
      ## Customer-facing response contract
      Your visible response is sent directly to the customer on WhatsApp.
      - Never print tool names, tool arguments, JSON, code fences, analysis, or reasoning.
      - Use tools silently, then send one polished natural-language reply.
      - Do not repeat a question whose answer is already in the conversation or Existing lead memory.
      - Acknowledge the facts the buyer just supplied and ask only the single most useful missing question.
      - Never invent listings, prices, fees, policies, availability, or business claims. If verified data is absent, say you will confirm with the team.
      - Avoid markdown tables. Keep the answer concise and readable in WhatsApp.
      [System message: This message was sent on ${this.datesHelper.localWeekdayName()} ${nowInCompanyTimezone}
      If you need to know the names of the upcoming days, use these values:
      ${this.datesHelper.getDateAliases()}]
      `

      const result = await this.aiRoutingService.generate({
        workload: this.hasMedia(chatHistory)
          ? AiWorkload.MultimodalChat
          : AiWorkload.LiveChat,
        companyId: company.id,
        contactId: contact.id,
        routingKey: `contact:${contact.id}`,
        system: systemPrompt,
        tools: assistant.tools,
        temperature: assistant.temperature || 0.1,
        messages: chatHistory as any,
        maxSteps: 5,
        maxOutputTokens: 700,
      })
      this.logger.log('ai-sdk generated text response', {
        context: 'processMessage',
        parameters: {
          contactId: contact.id,
          contactPhone: contact.phone,
          companyId: contact.companies.id,
          companyPhone: contact.companies.phone,
          chatHistoryLength: chatHistory,
          assistantId: company.assistant_id,
          assistantModel: result.model,
          provider: result.provider,
          fallbackIndex: result.fallbackIndex,
        },
        result: result.text,
      })
      return {
        text: result.text,
        usage: result.usage,
        provider: result.provider as ProviderKey,
        model: result.model as ModelKey,
      }
    } catch (error) {
      this.logger.error(`ai-sdk processing message failed`, {
        context: 'processMessage',
        parameters: {
          contactId: contact.id,
          contactPhone: contact.phone,
          companyId: contact.companies.id,
          companyPhone: contact.companies.phone,
          chatHistoryLength: chatHistory.length,
          assistantId: company.assistant_id,
          assistantModel: 'routed',
        },
        err: error,
      })

      // Return a meaningful error response instead of undefined
      throw new Error(`Failed to process message with ai-sdk`)
    }
  }

  /***
   * used to generate follow up and reminders
   */
  async processPrompts(
    contact: Contact,
    systemPrompt: string,
    prompt: string,
  ): Promise<{
    text: string
    usage: LanguageModelUsage
    model: ModelKey
    provider: ProviderKey
  }> {
    // Validate inputs
    if (!contact) {
      throw new Error('Contact is required')
    }

    if (!systemPrompt) {
      throw new Error('System prompt is required')
    }
    try {
      const result = await this.aiRoutingService.generate({
        workload: AiWorkload.LiveChat,
        companyId: contact.companies?.id,
        contactId: contact.id,
        routingKey: `contact:${contact.id}`,
        system: systemPrompt,
        prompt: prompt,
        maxOutputTokens: 500,
      })

      this.logger.log('Successfully generated text response', {
        context: 'processPrompt',
        parameters: {
          provider: result.provider,
          model: result.model,
          contactId: contact?.id,
          contactPhone: contact?.phone,
          companyId: contact?.companies?.id,
          companyPhone: contact?.companies?.phone,
          prompt: prompt,
          systemPrompt: systemPrompt,
        },
        result: result.text,
      })
      return {
        text: result.text,
        usage: result.usage,
        provider: result.provider as ProviderKey,
        model: result.model as ModelKey,
      }
    } catch (error) {
      this.logger.error('process prompt failed', {
        context: 'processPrompt',
        parameters: {
          provider: 'routed',
          model: 'automatic',
          contactId: contact?.id,
          contactPhone: contact?.phone,
          companyId: contact?.companies?.id,
          companyPhone: contact?.companies?.phone,
          prompt: prompt,
          systemPrompt: systemPrompt,
        },
        error: error,
      })

      // Return a meaningful error response instead of undefined
      throw new Error(
        `Failed to process message with Google AI: ${error.message}`,
      )
    }
  }

  private hasMedia(messages: AiChatMessage[]): boolean {
    return messages.some(message =>
      message.content.some(part => part.type === 'file'),
    )
  }

  private buildLeadMemory(contact: Contact): string {
    const copy = decryptContactFields({ ...contact }) as Contact
    const facts = [
      copy.name ? `Name: ${copy.name}` : null,
      copy.whatsapp_profile_name
        ? `WhatsApp profile: ${copy.whatsapp_profile_name}`
        : null,
      copy.budget_raw ? `Budget: ${copy.budget_raw}` : null,
      copy.property_type ? `Property type: ${copy.property_type}` : null,
      copy.preferred_location
        ? `Preferred location: ${copy.preferred_location}`
        : null,
      copy.bedrooms ? `Bedrooms: ${copy.bedrooms}` : null,
      copy.purchase_timeline ? `Timeline: ${copy.purchase_timeline}` : null,
      copy.payment_plan ? `Payment plan: ${copy.payment_plan}` : null,
      copy.qualification_notes ? `Notes: ${copy.qualification_notes}` : null,
      copy.qual_stage ? `Lead stage: ${copy.qual_stage}` : null,
    ].filter(Boolean)
    return facts.length
      ? `\n## Existing lead memory\nUse these saved facts and do not ask for them again unless the buyer corrects them.\n${facts.map(fact => `- ${fact}`).join('\n')}\n`
      : ''
  }
}
