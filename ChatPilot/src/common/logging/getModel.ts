// Supported Gemini models
export const GEMINI_MODELS = ['gemini-3.6-flash'] as const

export type GeminiModelKey = (typeof GEMINI_MODELS)[number]
export type ModelKey = GeminiModelKey | (string & {})
export type ProviderKey = 'google' | 'cloudflare' | 'groq'
