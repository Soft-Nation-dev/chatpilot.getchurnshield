import { Injectable, Logger } from '@nestjs/common'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import { PrismaService } from 'src/prisma/prisma.service'
import { decryptMessagesInPlace } from 'src/common/crypto/message-crypto'
import { AUTHOR_TYPE } from 'src/utils/constants/types'
import {
  CONTENT_LEARNING_PROMPT,
  CONVERSATION_LEARNING_PROMPT,
} from '../constants/learning-prompt'

const LEARNING_MODEL = process.env.LEARNING_MODEL || 'gemini-3.6-flash'
const MIN_SAMPLE = Number(process.env.LEARNING_MIN_SAMPLE || 6)
const LOOKBACK_DAYS = Number(process.env.LEARNING_LOOKBACK_DAYS || 30)
const MAX_CONVERSATIONS = 12
const MAX_MESSAGES_PER_CONVERSATION = 24

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name)

  constructor(private readonly prisma: PrismaService) {}

  async runForAllCompanies(): Promise<{ analysed: number }> {
    const companies = await this.prisma.companies.findMany({
      select: { id: true },
    })

    let analysed = 0
    for (const company of companies) {
      try {
        const conversation = await this.learnFromConversations(company.id)
        const content = await this.learnFromContent(company.id)
        if (conversation || content) analysed++
      } catch (error) {
        this.logger.error(
          `Learning failed for company ${company.id}`,
          error?.message,
        )
      }
    }

    return { analysed }
  }

  async learnFromConversations(companyId: number): Promise<boolean> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000)

    const [won, lost] = await Promise.all([
      this.prisma.contacts.findMany({
        where: {
          company_id: companyId,
          updated_at: { gte: since },
          OR: [
            { qual_stage: { in: ['booked', 'qualified'] } },
            { crm_appointment_id: { not: null } },
          ],
        },
        orderBy: { updated_at: 'desc' },
        take: MAX_CONVERSATIONS,
        select: { id: true },
      }),
      this.prisma.contacts.findMany({
        where: {
          company_id: companyId,
          updated_at: { gte: since },
          crm_appointment_id: null,
          qual_stage: { in: ['new', 'engaged', 'lost'] },
          follow_up_stage: { gte: 1 },
        },
        orderBy: { updated_at: 'desc' },
        take: MAX_CONVERSATIONS,
        select: { id: true },
      }),
    ])

    if (won.length + lost.length < MIN_SAMPLE) {
      this.logger.log(
        `Company ${companyId}: only ${won.length + lost.length} conversations, need ${MIN_SAMPLE}`,
      )
      return false
    }

    const wonText = await this.renderConversations(won.map(c => c.id))
    const lostText = await this.renderConversations(lost.map(c => c.id))

    const result = await this.ask(
      CONVERSATION_LEARNING_PROMPT,
      `WON CONVERSATIONS (${won.length}):\n\n${wonText}\n\n---\n\nLOST CONVERSATIONS (${lost.length}):\n\n${lostText}`,
    )

    if (!result || result.confidence === 'low') {
      this.logger.log(
        `Company ${companyId}: conversation learning produced no confident guidance`,
      )
      return false
    }

    await this.store(companyId, 'conversation', result.guidelines, {
      sampleSize: won.length + lost.length,
      wonCount: won.length,
      lostCount: lost.length,
    })

    return true
  }

  async learnFromContent(companyId: number): Promise<boolean> {
    const posts = await this.prisma.content_posts.findMany({
      where: { company_id: companyId, status: 'published' },
      orderBy: { published_at: 'desc' },
      take: 25,
    })

    if (posts.length < MIN_SAMPLE) return false

    const rendered = posts
      .map(
        p =>
          `[${p.kind}] comments=${p.comments_count} whatsapp_conversations=${p.wa_clicks}\n${p.caption.slice(0, 400)}`,
      )
      .join('\n\n---\n\n')

    const result = await this.ask(
      CONTENT_LEARNING_PROMPT,
      `PUBLISHED POSTS (${posts.length}):\n\n${rendered}`,
    )

    if (!result || result.confidence === 'low') return false

    await this.store(companyId, 'content', result.guidelines, {
      sampleSize: posts.length,
      wonCount: posts.filter(p => p.wa_clicks > 0).length,
      lostCount: posts.filter(p => p.wa_clicks === 0).length,
    })

    return true
  }

  async activeGuidelines(
    companyId: number,
    scope: string,
  ): Promise<string | null> {
    const row = await this.prisma.learned_guidelines.findFirst({
      where: { company_id: companyId, scope, is_active: true },
      orderBy: { id: 'desc' },
    })
    return row?.guidelines ?? null
  }

  private async store(
    companyId: number,
    scope: string,
    guidelines: string,
    stats: { sampleSize: number; wonCount: number; lostCount: number },
  ) {
    await this.prisma.learned_guidelines.updateMany({
      where: { company_id: companyId, scope, is_active: true },
      data: { is_active: false },
    })

    await this.prisma.learned_guidelines.create({
      data: {
        company_id: companyId,
        scope,
        guidelines,
        sample_size: stats.sampleSize,
        won_count: stats.wonCount,
        lost_count: stats.lostCount,
        is_active: true,
      },
    })

    this.logger.log(
      `Company ${companyId}: stored new ${scope} guidelines from ${stats.sampleSize} samples`,
    )
  }

  private async renderConversations(contactIds: number[]): Promise<string> {
    if (!contactIds.length) return '(none)'

    const blocks: string[] = []

    for (const contactId of contactIds) {
      const messages = await this.prisma.messages.findMany({
        where: { contact_id: contactId },
        orderBy: { sent_at: 'asc' },
        take: MAX_MESSAGES_PER_CONVERSATION,
      })

      decryptMessagesInPlace(messages)

      const lines = messages.map(m => {
        const who = m.author_type === AUTHOR_TYPE.HUMAN ? 'BUYER' : 'AGENT'
        return `${who}: ${(m.message || '').slice(0, 300)}`
      })

      if (lines.length) blocks.push(lines.join('\n'))
    }

    return blocks.length ? blocks.join('\n\n===\n\n') : '(none)'
  }

  private async ask(
    system: string,
    user: string,
  ): Promise<{ guidelines: string; confidence: string } | null> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return null

    try {
      const google = createGoogleGenerativeAI({ apiKey })
      const { text } = await generateText({
        model: google(LEARNING_MODEL),
        system,
        temperature: 0.2,
        messages: [
          { role: 'user', content: [{ type: 'text', text: user.slice(0, 60000) }] },
        ],
      })

      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start === -1 || end === -1) return null

      const parsed = JSON.parse(text.slice(start, end + 1))
      const guidelines = String(parsed.guidelines || '').trim()
      if (!guidelines) return null

      return {
        guidelines,
        confidence: String(parsed.confidence || 'low').toLowerCase(),
      }
    } catch (error) {
      this.logger.error('Learning model call failed', error?.message)
      return null
    }
  }
}
