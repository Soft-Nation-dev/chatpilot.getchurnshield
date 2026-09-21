import { AiProviderAdapterService } from './ai-provider-adapter.service'

describe('AiProviderAdapterService', () => {
  const original = { ...process.env }
  const service = new AiProviderAdapterService()

  afterEach(() => {
    process.env = { ...original }
  })

  it('keeps Groq and Gemini independent from Cloudflare by default', () => {
    delete process.env.GROQ_ROUTE
    delete process.env.GEMINI_ROUTE
    expect(service.routeFor('groq')).toBe('direct')
    expect(service.routeFor('google')).toBe('direct')
  })

  it('allows an authenticated gateway route when explicitly selected', () => {
    process.env.GROQ_ROUTE = 'gateway'
    expect(service.routeFor('groq')).toBe('gateway')
  })

  it('redacts provider credentials from diagnostic messages', () => {
    const reason = service.safeErrorReason(
      new Error('Unauthorized Bearer gsk_secret-token-value'),
    )
    expect(reason).toContain('Bearer [redacted]')
    expect(reason).not.toContain('gsk_secret')
  })
})
