import { IntentTriageService } from './intent-triage.service'

describe('IntentTriageService', () => {
  const service = new IntentTriageService()

  it('routes buyer messages into qualification', () => {
    expect(service.classify('I need a 4 bedroom duplex in Lekki')).toMatchObject({
      state: 'QUALIFYING',
      automate: true,
    })
  })

  it('hands explicit vendor and support requests to the team', () => {
    expect(service.classify('I am a supplier and want a partnership')).toMatchObject({
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
})
