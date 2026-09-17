import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { Contact } from 'src/utils/constants/types'
import {
  GEMINI_MODELS,
  GeminiModelKey,
} from 'src/common/logging/getModel'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { LanguageModel } from 'ai'
import { AiToolsService } from './ai-tools.service'
import {
  BUILTIN_TOOL_INSTRUCTIONS,
  buildAssetsPrompt,
} from '../constants/builtin-prompt'
import { REAL_ESTATE_KNOWLEDGE } from '../constants/real-estate-prompt'

const DEFAULT_MODEL: GeminiModelKey = 'gemini-3.6-flash'

type AssistantConfig = {
  systemPrompt: string
  model: LanguageModel
  tools: any
  temperature: number
  metadata: {
    provider: string
    model: string
  }
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

  async getAssistantConfig(contact: Contact): Promise<AssistantConfig | null> {
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

      const modelConfig = this.getModel(assistant.model ?? DEFAULT_MODEL)
      const tools = this.aiToolsService.getContactTools(contact, [])

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
        model: modelConfig.model,
        tools,
        temperature: assistant.temperature ?? 0.1,
        metadata: modelConfig.metadata,
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
      const properties = await this.prismaService.properties.findMany({
        where: { company_id: companyId, status: 'available' },
        orderBy: { id: 'desc' },
        take: 30,
      })

      if (!properties.length) return ''

      const lines = properties.map(p => {
        const bits: string[] = [p.title]
        if (p.property_type) bits.push(p.property_type)
        if (p.location) bits.push(p.location)
        if (p.state) bits.push(p.state)
        if (p.size_sqm) bits.push(`${p.size_sqm} sqm`)
        if (p.bedrooms) bits.push(`${p.bedrooms} bedrooms`)
        if (p.title_document) bits.push(`title: ${p.title_document}`)
        if (p.price != null) {
          const currency = p.currency || 'NGN'
          bits.push(
            p.price_max != null && p.price_max !== p.price
              ? `price: ${currency} ${p.price} - ${p.price_max}`
              : `price: ${currency} ${p.price}`,
          )
        }
        if (p.payment_plan) bits.push(`payment: ${p.payment_plan}`)
        if (p.features) bits.push(`features: ${p.features}`)
        return `- ${bits.join(' | ')}`
      })

      return `\n\n## Available Inventory\n\nThese are the ONLY properties you may quote or describe. If a buyer asks about something not listed here, say you will confirm with the office and call notify_company. Never invent a property, price or title status.\n\n${lines.join('\n')}`
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

  private getModel(modelName: string): {
    model: LanguageModel
    metadata: { provider: string; model: string }
  } {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    })

    const resolvedName = GEMINI_MODELS.includes(modelName as GeminiModelKey)
      ? (modelName as GeminiModelKey)
      : DEFAULT_MODEL

    return {
      model: google(resolvedName),
      metadata: {
        provider: 'google',
        model: resolvedName,
      },
    }
  }
}
