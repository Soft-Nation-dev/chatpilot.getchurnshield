import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  AiChatMessage,
  AiSdkToolsNames,
  Contact,
} from 'src/utils/constants/types'
import { AiToolsService } from './ai-tools.service'
import {
  BUILTIN_TOOL_INSTRUCTIONS,
  buildAssetsPrompt,
} from '../constants/builtin-prompt'
import { REAL_ESTATE_KNOWLEDGE } from '../constants/real-estate-prompt'

type AssistantConfig = {
  systemPrompt: string
  tools: any
  temperature: number
}

@Injectable()
export class AiAssistantConfigService {
  private readonly logger = new Logger(AiAssistantConfigService.name)

  constructor(
    private readonly prismaService: PrismaService,
    private readonly aiToolsService: AiToolsService,
  ) {
    this.logger.log('AiConfigService initialized')
  }

  async getAssistantConfig(
    contact: Contact,
    recentMessages: AiChatMessage[] = [],
  ): Promise<AssistantConfig | null> {
    const company = contact?.companies

    if (!company?.assistant_id) {
      this.logger.error('No assistant_id found for company', {
        companyId: company?.id,
      })
      return null
    }

    try {
      const [assistant, assets] = await Promise.all([
        this.prismaService.assistant_instructions.findFirst({
          where: { id: company.assistant_id },
        }),
        this.prismaService.company_assets.findMany({
          where: { company_id: company.id },
          select: {
            file_url: true,
            file_type: true,
            file_name: true,
            description: true,
          },
        }),
      ])

      if (!assistant) {
        this.logger.error('Assistant instructions not found', {
          assistantId: company.assistant_id,
        })
        return null
      }

      const tools = this.aiToolsService.getContactTools(
        contact,
        this.toolsToExclude(contact, recentMessages),
      )

      // Assemble full prompt: built-in tool instructions + company custom prompt + asset references
      const companyPrompt =
        assistant.system_prompt ?? 'You are a helpful AI assistant.'
      const assetsPrompt = buildAssetsPrompt(assets)
      const verticalPrompt =
        (company as any).vertical === 'real_estate'
          ? `\n\n${REAL_ESTATE_KNOWLEDGE}`
          : ''
      const inventoryPrompt = await this.buildInventoryPrompt(company.id)
      const learnedPrompt = await this.buildLearnedPrompt(company.id)
      const fullSystemPrompt = `${BUILTIN_TOOL_INSTRUCTIONS}${verticalPrompt}\n\n## Your Role & Instructions\n\n${companyPrompt}${assetsPrompt}${inventoryPrompt}${learnedPrompt}`

      return {
        systemPrompt: fullSystemPrompt,
        tools,
        temperature: assistant.temperature ?? 0.1,
      }
    } catch (error) {
      this.logger.error('Error getting assistant config', {
        context: 'getAssistantConfig',
        companyId: company.id,
        error: error.message,
      })
      return null
    }
  }

  private async buildInventoryPrompt(companyId: number): Promise<string> {
    try {
      const available = await this.prismaService.properties.count({
        where: { company_id: companyId, status: 'available' },
      })
      return `\n\n## Verified Inventory\n\nThe company currently has ${available} available properties. Never rely on memory or invent a listing. Call search_inventory before quoting, comparing or recommending a property. Call send_property_media only with a property ID returned by that search; the backend owns all media URLs.`
    } catch (error) {
      this.logger.error('Failed to build inventory prompt', {
        companyId,
        error: error.message,
      })
      return ''
    }
  }

  private async buildLearnedPrompt(companyId: number): Promise<string> {
    try {
      const learned = await this.prismaService.learned_guidelines.findFirst({
        where: {
          company_id: companyId,
          scope: 'conversation',
          is_active: true,
        },
        orderBy: { id: 'desc' },
      })

      if (!learned?.guidelines) return ''

      return `\n\n## What Works With These Buyers\n\nThese lessons come from reviewing this agency's own won and lost conversations. Apply them, but never at the cost of honesty.\n\n${learned.guidelines}`
    } catch (error) {
      this.logger.error('Failed to build learned prompt', {
        companyId,
        error: error.message,
      })
      return ''
    }
  }

  private toolsToExclude(
    contact: Contact,
    recentMessages: AiChatMessage[],
  ): AiSdkToolsNames[] {
    const context = recentMessages
      .slice(-4)
      .flatMap(message => message.content)
      .map(part => part.text || '')
      .join(' ')
      .toLowerCase()
    const appointmentContext =
      /appointment|inspection|inspect|schedule|booking|book|available slot|visit|viewing|reschedule|cancel/.test(
        context,
      ) || !!contact.crm_appointment_id
    const cancellationContext =
      /cancel|reschedule|change.*appointment/.test(context) ||
      !!contact.crm_appointment_id

    const excluded: AiSdkToolsNames[] = [
      'change_bot_status',
      'activate_replies',
    ]
    if (!appointmentContext) {
      excluded.push('get_available_slots', 'book_appointment')
    }
    if (!cancellationContext) excluded.push('cancel_appointment')
    return excluded
  }
}
