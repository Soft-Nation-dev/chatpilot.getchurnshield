import { WebhookService } from './webhook.service'

describe('WebhookService', () => {
  let service: WebhookService

  beforeEach(() => {
    service = new WebhookService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    )
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
