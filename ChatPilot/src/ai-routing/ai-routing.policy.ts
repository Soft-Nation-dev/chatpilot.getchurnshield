import {
  AiProviderName,
  AiWorkload,
  ProviderCandidate,
} from './ai-routing.types'

const CLOUDFLARE_CHAT = '@cf/openai/gpt-oss-20b'
const CLOUDFLARE_BACKGROUND = '@cf/qwen/qwen3-30b-a3b-fp8'
const CLOUDFLARE_VISION = '@cf/qwen/qwen3.8-27b'
const GROQ_CHAT = 'openai/gpt-oss-20b'
const GROQ_BACKGROUND = 'qwen/qwen3.8-27b'
const GEMINI = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const candidates = (
  values: Array<[AiProviderName, string, number]>,
): ProviderCandidate[] =>
  values.map(([provider, model, timeoutMs]) => ({
    provider,
    model,
    timeoutMs,
  }))

export function candidatesForWorkload(
  workload: AiWorkload,
): ProviderCandidate[] {
  if (workload === AiWorkload.Transcription) {
    return candidates([['google', GEMINI, 20_000]])
  }

  if (workload === AiWorkload.MultimodalChat) {
    return candidates([
      ['google', GEMINI, 18_000],
      ['cloudflare', CLOUDFLARE_VISION, 18_000],
    ])
  }

  if (workload === AiWorkload.LiveChat) {
    return candidates([
      ['cloudflare', CLOUDFLARE_CHAT, 12_000],
      ['groq', GROQ_CHAT, 8_000],
      ['google', GEMINI, 15_000],
    ])
  }

  return candidates([
    ['cloudflare', CLOUDFLARE_BACKGROUND, 18_000],
    ['groq', GROQ_BACKGROUND, 12_000],
    ['google', GEMINI, 18_000],
  ])
}

export function isBackgroundWorkload(workload: AiWorkload): boolean {
  return ![
    AiWorkload.LiveChat,
    AiWorkload.MultimodalChat,
    AiWorkload.Transcription,
  ].includes(workload)
}

export function statusCodeFromError(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as Record<string, any>
  const candidates = [
    value.statusCode,
    value.status,
    value.response?.status,
    value.cause?.statusCode,
    value.cause?.status,
  ]
  const code = candidates.find(candidate => Number.isFinite(Number(candidate)))
  return code === undefined ? null : Number(code)
}

export function isQuotaError(error: unknown): boolean {
  const status = statusCodeFromError(error)
  if (status === 429) return true
  const message = error instanceof Error ? error.message : String(error || '')
  return /resource_exhausted|quota|rate.?limit|too many requests/i.test(message)
}

export function isTransientError(error: unknown): boolean {
  const status = statusCodeFromError(error)
  if (status !== null && status >= 500) return true
  const message = error instanceof Error ? error.message : String(error || '')
  return /timeout|timed out|econnreset|econnrefused|fetch failed|temporar/i.test(
    message,
  )
}

export function estimateCloudflareNeurons(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates: Record<string, [number, number]> = {
    '@cf/openai/gpt-oss-20b': [18_182, 27_273],
    '@cf/qwen/qwen3-30b-a3b-fp8': [4_625, 30_475],
    '@cf/qwen/qwen3.8-27b': [40_909, 290_909],
  }
  const [inputRate, outputRate] = rates[model] ?? [40_000, 120_000]
  return (
    (Math.max(0, inputTokens) * inputRate) / 1_000_000 +
    (Math.max(0, outputTokens) * outputRate) / 1_000_000
  )
}
