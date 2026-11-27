import { LanguageModelUsage, ToolSet } from 'ai'

export enum AiWorkload {
  LiveChat = 'live-chat',
  MultimodalChat = 'multimodal-chat',
  Transcription = 'transcription',
  Social = 'social',
  Content = 'content',
  MediaIndex = 'media-index',
  Learning = 'learning',
  Prompt = 'prompt',
  BuyerFinder = 'buyer-finder',
}

export type AiProviderName = 'cloudflare' | 'groq' | 'google'

export type RoutedGenerateOptions = {
  workload: AiWorkload
  companyId?: number | null
  contactId?: number | null
  routingKey?: string
  system?: string
  prompt?: string
  messages?: any[]
  tools?: ToolSet
  temperature?: number
  maxSteps?: number
  maxOutputTokens?: number
}

export type RoutedGenerateResult = {
  text: string
  usage: LanguageModelUsage
  provider: AiProviderName
  model: string
  fallbackIndex: number
}

export type ProviderCandidate = {
  provider: AiProviderName
  model: string
  timeoutMs: number
}
