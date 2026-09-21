import { Injectable } from '@nestjs/common'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { LanguageModel } from 'ai'
import { AiProviderName, ProviderCandidate } from './ai-routing.types'

type ProviderRoute = 'direct' | 'gateway'

export function normalizeCompatibleRequestBody(
  body: BodyInit | null | undefined,
): BodyInit | null | undefined {
  if (typeof body !== 'string') return body
  try {
    const value = JSON.parse(body) as { messages?: Array<Record<string, any>> }
    if (!Array.isArray(value.messages)) return body
    value.messages = value.messages.map(message => {
      const normalized = { ...message }
      // GPT-OSS providers may return reasoning_content, but neither Groq nor
      // Cloudflare accepts that provider-specific field when the assistant
      // tool call is sent back for the next step.
      delete normalized.reasoning_content
      return normalized
    })
    return JSON.stringify(value)
  } catch {
    return body
  }
}

@Injectable()
export class AiProviderAdapterService {
  createModel(candidate: ProviderCandidate): LanguageModel {
    if (candidate.provider === 'cloudflare') {
      return this.cloudflareModel(candidate)
    }
    if (candidate.provider === 'groq') {
      return this.groqModel(candidate)
    }
    return this.googleModel(candidate)
  }

  isConfigured(provider: AiProviderName): boolean {
    if (provider === 'cloudflare') {
      return !!(
        process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
      )
    }
    if (provider === 'groq') return !!process.env.GROQ_API_KEY
    return !!process.env.GEMINI_API_KEY
  }

  routeFor(provider: AiProviderName): ProviderRoute {
    if (provider === 'cloudflare') return 'gateway'
    const value =
      provider === 'groq' ? process.env.GROQ_ROUTE : process.env.GEMINI_ROUTE
    return value?.trim().toLowerCase() === 'gateway' ? 'gateway' : 'direct'
  }

  safeErrorReason(error: unknown): string {
    const value = error as Record<string, any> | null
    const raw = [
      error instanceof Error ? error.message : null,
      value?.responseBody,
      value?.response?.data?.error?.message,
      value?.data?.error?.message,
      value?.cause?.message,
    ]
      .find(item => typeof item === 'string' && item.trim())
      ?.trim()

    return this.redact(raw || 'provider request failed').slice(0, 500)
  }

  private cloudflareModel(candidate: ProviderCandidate): LanguageModel {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID as string
    const gatewayId = process.env.CLOUDFLARE_AI_GATEWAY_ID || 'default'
    const baseURL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`
    const headers = { 'cf-aig-gateway-id': gatewayId }
    const provider = createOpenAICompatible({
      name: 'cloudflare',
      baseURL,
      apiKey: process.env.CLOUDFLARE_API_TOKEN,
      headers,
    })

    // Cloudflare's Responses endpoint currently accepts plain GPT-OSS turns
    // but rejects function tools. The documented Chat Completions endpoint
    // supports the broader Workers AI catalogue and function calling. Keep the
    // provider major aligned with AI SDK v5 so message content is serialized
    // using Cloudflare's accepted schema.
    return provider.chatModel(candidate.model)
  }

  private groqModel(candidate: ProviderCandidate): LanguageModel {
    const route = this.routeFor('groq')
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const gatewayId = process.env.CLOUDFLARE_AI_GATEWAY_ID || 'default'
    const throughGateway = route === 'gateway' && !!accountId
    const provider = createOpenAICompatible({
      name: 'groq',
      baseURL: throughGateway
        ? `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/groq`
        : 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      headers: throughGateway ? this.gatewayAuthenticationHeaders() : undefined,
      fetch: this.compatibleFetch,
    })
    return provider.chatModel(candidate.model)
  }

  private googleModel(candidate: ProviderCandidate): LanguageModel {
    const route = this.routeFor('google')
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const gatewayId = process.env.CLOUDFLARE_AI_GATEWAY_ID || 'default'
    const throughGateway = route === 'gateway' && !!accountId

    return createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      ...(throughGateway
        ? {
            baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-ai-studio/v1beta`,
            headers: this.gatewayAuthenticationHeaders(),
          }
        : {}),
    })(candidate.model)
  }

  private gatewayAuthenticationHeaders(): Record<string, string> | undefined {
    const token = process.env.CLOUDFLARE_API_TOKEN
    return token ? { 'cf-aig-authorization': `Bearer ${token}` } : undefined
  }

  private compatibleFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    return fetch(input, {
      ...init,
      body: normalizeCompatibleRequestBody(init?.body),
    })
  }

  private redact(input: string): string {
    return input
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/\b(?:gsk|AIza|cfat)_[A-Za-z0-9_-]+\b/g, '[redacted]')
  }
}
