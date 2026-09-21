import { Injectable } from '@nestjs/common'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { LanguageModel } from 'ai'
import { AiProviderName, ProviderCandidate } from './ai-routing.types'

type ProviderRoute = 'direct' | 'gateway'

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

    // Cloudflare documents the Responses API as the agentic endpoint for
    // GPT-OSS. It preserves multi-step tool calls more reliably than treating
    // Workers AI as a generic Chat Completions provider.
    if (candidate.model.includes('gpt-oss')) {
      const provider = createOpenAI({
        name: 'cloudflare',
        baseURL,
        apiKey: process.env.CLOUDFLARE_API_TOKEN,
        headers,
      })
      return provider.responses(candidate.model as any)
    }

    // Other Workers AI models continue through Cloudflare's OpenAI-compatible
    // Chat Completions endpoint, which supports the broader model catalogue.
    const provider = createOpenAICompatible({
      name: 'cloudflare',
      baseURL,
      apiKey: process.env.CLOUDFLARE_API_TOKEN,
      headers,
    })
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

  private redact(input: string): string {
    return input
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/\b(?:gsk|AIza|cfat)_[A-Za-z0-9_-]+\b/g, '[redacted]')
  }
}
