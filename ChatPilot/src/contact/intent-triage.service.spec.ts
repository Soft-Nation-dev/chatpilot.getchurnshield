import { IntentTriageService } from './intent-triage.service'

describe('IntentTriageService', () => {
  const aiRouting = { generate: jest.fn() }
  const service = new IntentTriageService(aiRouting as any)

  it('routes buyer messages into qualification', () => {
    expect(
      service.classify('I need a 4 bedroom duplex in Lekki'),
    ).toMatchObject({
      state: 'QUALIFYING',
      automate: true,
    })
  })

  it('hands explicit vendor and support requests to the team', () => {
    expect(
      service.classify('I am a supplier and want a partnership'),
    ).toMatchObject({
      state: 'HUMAN_TAKEOVER',
      automate: false,
    })
  })

  it('closes explicit opt-outs without an automated reply', () => {
    expect(service.classify('Please stop and remove my number')).toMatchObject({
      state: 'CONCLUDED_CLOSED',
      automate: false,
    })
  })

  it('reopens soft review for an explicit property media request', async () => {
    await expect(
      service.classifyReengagement('Please send pictures of the Lekki duplex'),
    ).resolves.toMatchObject({
      shouldResume: true,
      intent: 'property_media',
      classifier: 'rule',
    })
  })

  it('does not reopen soft review for a greeting or acknowledgement', async () => {
    await expect(
      service.classifyReengagement('Okay, thanks'),
    ).resolves.toMatchObject({
      shouldResume: false,
      intent: 'social_or_acknowledgement',
    })
  })

  it('does not reopen when the customer requests a human', async () => {
    await expect(
      service.classifyReengagement('Please connect me with a human agent'),
    ).resolves.toMatchObject({
      shouldResume: false,
      intent: 'human_support',
    })
  })

  it('uses a strict model verdict for an ambiguous but concrete new query', async () => {
    aiRouting.generate.mockResolvedValueOnce({
      text: '{"intent":"business_query","topic":"property_details","confidence":0.91}',
      provider: 'groq',
    })
    await expect(
      service.classifyReengagement('Can you explain the terms for that one?'),
    ).resolves.toMatchObject({
      shouldResume: true,
      intent: 'property_details',
      confidence: 0.91,
      classifier: 'groq',
    })
  })

  it('fails closed when intent classification is unavailable', async () => {
    aiRouting.generate.mockRejectedValueOnce(new Error('unavailable'))
    await expect(
      service.classifyReengagement('Can we continue from before?'),
    ).resolves.toMatchObject({
      shouldResume: false,
      classifier: 'unavailable',
    })
  })
})
