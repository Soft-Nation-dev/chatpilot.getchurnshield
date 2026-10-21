import { UnifiedMessageProcessingService } from './unified-message-processing.service'

describe('UnifiedMessageProcessingService', () => {
  const contact = {
    id: 42,
    total_messages: 50,
    companies: { id: 7 },
  } as any

  const ai = {
    processMessage: jest.fn(),
  }
  const contacts = {
    archiveContact: jest.fn(),
    updateContact: jest.fn(),
    getAiChatHistoryMultimodal: jest.fn(),
  }
  const conversationState = {
    prepareTurn: jest.fn(),
    recordExchange: jest.fn(),
  }
  const lifecycle = {
    gate: jest.fn(),
  }

  let service: UnifiedMessageProcessingService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new UnifiedMessageProcessingService(
      ai as any,
      contacts as any,
      conversationState as any,
      lifecycle as any,
    )
    lifecycle.gate.mockResolvedValue({ allowed: true })
    contacts.updateContact.mockResolvedValue({ ...contact, total_messages: 51 })
    contacts.getAiChatHistoryMultimodal.mockResolvedValue([])
    conversationState.prepareTurn.mockResolvedValue({
      deterministicReply: null,
      systemContext: 'compact context',
    })
    ai.processMessage.mockResolvedValue({ text: 'Here is the useful answer.' })
  })

  it('continues normally after the old 50-message threshold', async () => {
    const result = await service.processClientMessage(
      contact,
      'Can you show me another property?',
      7,
      false,
    )

    expect(result).toBe('Here is the useful answer.')
    expect(ai.processMessage).toHaveBeenCalledTimes(1)
    expect(conversationState.recordExchange).toHaveBeenCalledWith(
      42,
      'Can you show me another property?',
      'Here is the useful answer.',
    )
  })
})
