import {
  candidatesForWorkload,
  estimateCloudflareNeurons,
  isQuotaError,
  statusCodeFromError,
} from './ai-routing.policy'
import { AiWorkload } from './ai-routing.types'

describe('AI routing policy', () => {
  it('uses Cloudflare then Groq then Gemini for live text chat', () => {
    const candidates = candidatesForWorkload(AiWorkload.LiveChat)
    expect(candidates.map(item => item.provider)).toEqual([
      'cloudflare',
      'groq',
      'google',
    ])
    expect(candidates[0].model).toBe('@cf/qwen/qwen3.8-27b')
  })

  it('reserves Gemini as the first multimodal provider', () => {
    expect(candidatesForWorkload(AiWorkload.MultimodalChat)[0].provider).toBe(
      'google',
    )
  })

  it('does not send audio transcription to a vision-only fallback', () => {
    expect(
      candidatesForWorkload(AiWorkload.Transcription).map(
        item => item.provider,
      ),
    ).toEqual(['google'])
  })

  it('detects quota responses without exposing provider internals', () => {
    const error = { statusCode: 429, message: 'RESOURCE_EXHAUSTED' }
    expect(statusCodeFromError(error)).toBe(429)
    expect(isQuotaError(error)).toBe(true)
  })

  it('estimates Cloudflare usage from model-specific neuron rates', () => {
    const estimated = estimateCloudflareNeurons(
      '@cf/openai/gpt-oss-20b',
      5000,
      200,
    )
    expect(estimated).toBeGreaterThan(95)
    expect(estimated).toBeLessThan(98)
  })
})
