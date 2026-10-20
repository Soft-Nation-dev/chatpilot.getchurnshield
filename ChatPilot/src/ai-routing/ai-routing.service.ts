import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { generateText, stepCountIs, ToolSet } from 'ai'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  candidatesForWorkload,
  estimateCloudflareNeurons,
  isBackgroundWorkload,
  isQuotaError,
  isTransientError,
  statusCodeFromError,
} from './ai-routing.policy'
import {
  AiProviderName,
  AiWorkload,
  ProviderCandidate,
  RoutedGenerateOptions,
  RoutedGenerateResult,
} from './ai-routing.types'
import { AiProviderAdapterService } from './ai-provider-adapter.service'
import { sanitizeCustomerOutput } from './customer-output-guard'

type StickyRoute = { provider: AiProviderName; expiresAt: number }
type ToolExecution = { name: string; result: unknown }

const STICKY_TTL_MS = 15 * 60 * 1000

@Injectable()
export class AiRoutingService {
  private readonly logger = new Logger(AiRoutingService.name)
  private readonly circuits = new Map<AiProviderName, number>()
  private readonly stickyRoutes = new Map<string, StickyRoute>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderAdapterService,
  ) {}

  async generate(
    options: RoutedGenerateOptions,
  ): Promise<RoutedGenerateResult> {
    const candidates = this.orderCandidates(
      candidatesForWorkload(options.workload),
      options.routingKey,
    )
    const executedTools: ToolExecution[] = []
    let lastError: unknown = null

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]
      if (!this.providers.isConfigured(candidate.provider)) continue
      if (this.isCircuitOpen(candidate.provider)) continue
      if (!(await this.isWithinBudget(candidate, options.workload))) continue

      const startedAt = Date.now()
      try {
        const model = this.providers.createModel(candidate)
        const tools = executedTools.length
          ? undefined
          : this.trackToolExecutions(options.tools, executedTools)
        const completedActions = executedTools.length
          ? `\n\nActions already completed during this turn. Do not repeat them or call more tools. Respond naturally using these results:\n${executedTools
              .map(
                action => `- ${action.name}: ${JSON.stringify(action.result)}`,
              )
              .join('\n')}`
          : ''

        const result = await generateText({
          model,
          system: `${options.system || ''}${completedActions}`,
          ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
          ...(options.messages === undefined
            ? {}
            : { messages: options.messages }),
          ...(tools === undefined ? {} : { tools }),
          temperature: options.temperature,
          maxOutputTokens: options.maxOutputTokens,
          stopWhen: options.maxSteps
            ? stepCountIs(options.maxSteps)
            : undefined,
          abortSignal: AbortSignal.timeout(candidate.timeoutMs),
        } as any)

        const generatedText = [
          AiWorkload.LiveChat,
          AiWorkload.MultimodalChat,
        ].includes(options.workload)
          ? sanitizeCustomerOutput(result.text)
          : result.text?.trim()
        const customerText =
          generatedText || this.customerReplyFromToolResults(executedTools)
        if (!customerText) {
          throw new Error('Provider returned no customer-facing response')
        }

        await this.recordAttempt({
          options,
          candidate,
          status: 'success',
          latencyMs: Date.now() - startedAt,
          fallbackIndex: index,
          usage: result.usage,
        })
        this.closeCircuit(candidate.provider)
        this.rememberStickyRoute(options.routingKey, candidate.provider)

        return {
          text: customerText,
          usage: result.usage,
          provider: candidate.provider,
          model: candidate.model,
          fallbackIndex: index,
        }
      } catch (error) {
        lastError = error
        const statusCode = statusCodeFromError(error)
        await this.recordAttempt({
          options,
          candidate,
          status: 'failed',
          latencyMs: Date.now() - startedAt,
          fallbackIndex: index,
          errorCode: statusCode ? String(statusCode) : 'unknown',
        })

        if (isQuotaError(error)) {
          this.openCircuit(
            candidate.provider,
            this.quotaCooldown(candidate.provider),
          )
        } else if (isTransientError(error)) {
          this.openCircuit(candidate.provider, 60_000)
        }

        this.logger.warn(
          JSON.stringify({
            event: 'ai_provider_failed',
            provider: candidate.provider,
            model: candidate.model,
            workload: options.workload,
            fallbackIndex: index,
            statusCode,
            reason: this.providers.safeErrorReason(error),
            toolExecutions: executedTools.length,
          }),
        )

        const recoveredText = this.customerReplyFromToolResults(executedTools)
        if (recoveredText) {
          this.closeCircuit(candidate.provider)
          return {
            text: recoveredText,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
            } as any,
            provider: candidate.provider,
            model: candidate.model,
            fallbackIndex: index,
          }
        }
      }
    }

    this.logger.error(
      JSON.stringify({
        event: 'ai_all_providers_failed',
        workload: options.workload,
        companyId: options.companyId,
        contactId: options.contactId,
        reason: lastError instanceof Error ? lastError.message : 'unavailable',
      }),
    )
    throw new ServiceUnavailableException(
      'AI providers are temporarily unavailable. Please try again shortly.',
    )
  }

  async transcribeAudio(
    buffer: Buffer,
    mimeType: string,
    metadata: { companyId?: number; contactId?: number } = {},
  ): Promise<string> {
    const geminiConfigured = this.providers.isConfigured('google')
    if (geminiConfigured && !this.isCircuitOpen('google')) {
      try {
        const result = await this.generate({
          workload: AiWorkload.Transcription,
          companyId: metadata.companyId,
          contactId: metadata.contactId,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Transcribe this audio exactly. Return only the transcription text, nothing else.',
                },
                { type: 'file', data: buffer, mediaType: mimeType },
              ],
            },
          ],
          maxOutputTokens: 1000,
        })
        return result.text
      } catch {
        // Groq Whisper below is the final transcription fallback.
      }
    }

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) {
      throw new ServiceUnavailableException(
        'Audio transcription is unavailable',
      )
    }

    const form = new FormData()
    form.append(
      'model',
      process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo',
    )
    form.append('response_format', 'json')
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      'voice-message.ogg',
    )
    const response = await fetch(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
        signal: AbortSignal.timeout(20_000),
      },
    )
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Audio transcription is unavailable',
      )
    }
    const body = (await response.json()) as { text?: string }
    if (!body.text?.trim()) {
      throw new ServiceUnavailableException(
        'Audio transcription returned no text',
      )
    }
    return body.text.trim()
  }

  private orderCandidates(
    candidates: ProviderCandidate[],
    routingKey?: string,
  ): ProviderCandidate[] {
    if (!routingKey) return candidates
    const sticky = this.stickyRoutes.get(routingKey)
    if (!sticky || sticky.expiresAt <= Date.now()) {
      this.stickyRoutes.delete(routingKey)
      return candidates
    }
    const selected = candidates.find(item => item.provider === sticky.provider)
    return selected
      ? [selected, ...candidates.filter(item => item !== selected)]
      : candidates
  }

  private rememberStickyRoute(
    routingKey: string | undefined,
    provider: AiProviderName,
  ) {
    if (!routingKey) return
    this.stickyRoutes.set(routingKey, {
      provider,
      expiresAt: Date.now() + STICKY_TTL_MS,
    })
  }

  private trackToolExecutions(
    tools: ToolSet | undefined,
    executions: ToolExecution[],
  ): ToolSet | undefined {
    if (!tools) return undefined
    return Object.fromEntries(
      Object.entries(tools).map(([name, tool]: [string, any]) => {
        if (typeof tool.execute !== 'function') return [name, tool]
        return [
          name,
          {
            ...tool,
            execute: async (args: unknown, callOptions: unknown) => {
              const result = await tool.execute(args, callOptions)
              executions.push({ name, result })
              return result
            },
          },
        ]
      }),
    ) as ToolSet
  }

  private customerReplyFromToolResults(
    executions: ToolExecution[],
  ): string | null {
    const last = executions[executions.length - 1]
    if (!last) return null
    const serialized =
      typeof last.result === 'string'
        ? last.result
        : JSON.stringify(last.result || '')

    if (/"state":"awaiting_human"/.test(serialized)) {
      return 'I’ve saved your inspection request. Our team is confirming the available time and will get back to you shortly.'
    }
    if (last.name === 'book_appointment') {
      return /booked successfully/i.test(serialized)
        ? serialized
        : 'I’ve saved your inspection request. Our team will confirm the booking shortly.'
    }
    if (last.name === 'cancel_appointment') {
      return /cancelled successfully/i.test(serialized)
        ? serialized
        : 'I’ve saved your cancellation request. Our team will confirm it shortly.'
    }
    if (last.name === 'send_property_media') {
      return /^Sent\s+\d+\s+verified image/i.test(serialized)
        ? 'I’ve sent the property pictures. Let me know which detail you would like me to clarify.'
        : null
    }
    if (last.name === 'search_inventory') {
      try {
        const parsed = JSON.parse(serialized)
        const matches = Array.isArray(parsed?.matches)
          ? parsed.matches.slice(0, 3)
          : []
        if (!matches.length) {
          return 'I couldn’t find a verified available property matching that request. I can flag it for the team to confirm.'
        }
        const lines = matches.map((property: any) => {
          const details = [
            property.propertyType,
            property.bedrooms ? `${property.bedrooms} bedrooms` : null,
            [property.location, property.state].filter(Boolean).join(', '),
            property.price
              ? `${property.currency || 'NGN'} ${Number(property.price).toLocaleString('en-NG')}`
              : null,
          ].filter(Boolean)
          return `• ${property.title}${details.length ? ` — ${details.join(' · ')}` : ''}`
        })
        return `Here are the verified matches I found:\n${lines.join('\n')}`
      } catch {
        return null
      }
    }
    if (last.name !== 'get_available_slots') return null

    try {
      const parsed = JSON.parse(serialized)
      if (!parsed?.success || !parsed?.slots) return null
      const times = Object.values(parsed.slots)
        .flatMap((slots: any) => slots)
        .map((slot: any) => slot?.time || slot?.start)
        .filter(Boolean)
        .slice(0, 6)
      if (!times.length) {
        return 'I couldn’t find an open inspection time in that range. What other day would work for you?'
      }
      return `These inspection times are available:\n${times
        .map((time: string) => `• ${time}`)
        .join('\n')}\nWhich one works best for you?`
    } catch {
      return null
    }
  }

  private isCircuitOpen(provider: AiProviderName): boolean {
    const until = this.circuits.get(provider) || 0
    if (until <= Date.now()) {
      this.circuits.delete(provider)
      return false
    }
    return true
  }

  private openCircuit(provider: AiProviderName, durationMs: number) {
    this.circuits.set(provider, Date.now() + durationMs)
  }

  private closeCircuit(provider: AiProviderName) {
    this.circuits.delete(provider)
  }

  private quotaCooldown(provider: AiProviderName): number {
    if (provider === 'google') return 60 * 60 * 1000
    if (provider === 'cloudflare') return 15 * 60 * 1000
    return 10 * 60 * 1000
  }

  private async isWithinBudget(
    candidate: ProviderCandidate,
    workload: AiWorkload,
  ): Promise<boolean> {
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const rows = await this.prisma.ai_usage_events.findMany({
      where: { provider: candidate.provider, created_at: { gte: since } },
      select: {
        status: true,
        total_tokens: true,
        estimated_units: true,
      },
    })
    const background = isBackgroundWorkload(workload)

    if (candidate.provider === 'google') {
      const attempts = rows.length
      const dailyLimit = this.numberEnv('AI_GEMINI_DAILY_REQUEST_BUDGET', 20)
      const backgroundLimit = this.numberEnv(
        'AI_GEMINI_BACKGROUND_REQUEST_BUDGET',
        Math.max(0, dailyLimit - 6),
      )
      return attempts < (background ? backgroundLimit : dailyLimit)
    }
    if (candidate.provider === 'groq') {
      const tokens = rows.reduce((sum, row) => sum + (row.total_tokens || 0), 0)
      const dailyLimit = this.numberEnv('AI_GROQ_DAILY_TOKEN_BUDGET', 195_000)
      const backgroundLimit = this.numberEnv(
        'AI_GROQ_BACKGROUND_TOKEN_BUDGET',
        120_000,
      )
      return tokens < (background ? backgroundLimit : dailyLimit)
    }
    const neurons = rows.reduce(
      (sum, row) => sum + (row.estimated_units || 0),
      0,
    )
    const dailyLimit = this.numberEnv(
      'AI_CLOUDFLARE_DAILY_NEURON_BUDGET',
      9_900,
    )
    const backgroundLimit = this.numberEnv(
      'AI_CLOUDFLARE_BACKGROUND_NEURON_BUDGET',
      8_000,
    )
    return neurons < (background ? backgroundLimit : dailyLimit)
  }

  private numberEnv(name: string, fallback: number): number {
    const value = Number(process.env[name])
    return Number.isFinite(value) && value >= 0 ? value : fallback
  }

  private async recordAttempt(input: {
    options: RoutedGenerateOptions
    candidate: ProviderCandidate
    status: string
    latencyMs: number
    fallbackIndex: number
    usage?: {
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
    }
    errorCode?: string
  }) {
    const inputTokens = input.usage?.inputTokens || 0
    const outputTokens = input.usage?.outputTokens || 0
    const estimatedUnits =
      input.candidate.provider === 'cloudflare'
        ? estimateCloudflareNeurons(
            input.candidate.model,
            inputTokens,
            outputTokens,
          )
        : 0
    try {
      await this.prisma.ai_usage_events.create({
        data: {
          company_id: input.options.companyId ?? null,
          contact_id: input.options.contactId ?? null,
          workload: input.options.workload,
          provider: input.candidate.provider,
          model: input.candidate.model,
          status: input.status,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens:
            input.usage?.totalTokens || inputTokens + outputTokens || 0,
          estimated_units: estimatedUnits,
          latency_ms: input.latencyMs,
          fallback_index: input.fallbackIndex,
          error_code: input.errorCode ?? null,
        },
      })
    } catch (error) {
      this.logger.warn(`AI usage logging failed: ${error?.message}`)
    }
  }
}
