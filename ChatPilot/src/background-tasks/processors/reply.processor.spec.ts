import { ReplyProcessor } from './reply.processor'

describe('ReplyProcessor reliable retries', () => {
  const inboundAt = new Date('2026-10-20T15:42:36Z')

  function setup(overrides: Record<string, unknown> = {}) {
    const contactService = {
      getUnProcessedMessages: jest.fn().mockResolvedValue({
        id: 459,
        company_id: 6,
        phone: BigInt(2348000000000),
        messages: [
          {
            id: 1,
            author_type: 'human',
            message: 'The pic pls',
            sent_at: inboundAt,
          },
        ],
        companies: { id: 6, phone: BigInt(2348129409992) },
      }),
      hasOutboundReplyAfter: jest.fn().mockResolvedValue(false),
      markMessagesProcessed: jest.fn(),
      mockTypingState: jest.fn(),
      clearTypingState: jest.fn(),
      getContactById: jest.fn().mockResolvedValue({}),
      updateContact: jest.fn(),
      sendMessage: jest.fn(),
      ...overrides,
    } as any
    const messageProcessing = {
      processClientMessage: jest
        .fn()
        .mockRejectedValue(new Error('providers unavailable')),
    } as any
    const formatter = {
      splitMessage: jest.fn(value => [value]),
      getMarkdownImage: jest.fn(),
    } as any
    const notifications = { create: jest.fn() } as any
    const lifecycle = {
      gate: jest.fn().mockResolvedValue({ allowed: true, state: 'QUALIFYING' }),
      recordAutomation: jest.fn(),
    } as any
    return {
      processor: new ReplyProcessor(
        contactService,
        messageProcessing,
        formatter,
        notifications,
        lifecycle,
      ),
      contactService,
      messageProcessing,
      notifications,
      lifecycle,
    }
  }

  it('skips a retry when a human or prior attempt already replied', async () => {
    const { processor, contactService, messageProcessing } = setup({
      hasOutboundReplyAfter: jest.fn().mockResolvedValue(true),
    })

    const result = await processor.process({
      data: { clientId: 459 },
      attemptsMade: 1,
      opts: { attempts: 4 },
      id: 'reply-459',
    } as any)

    expect(result).toMatchObject({ superseded: true })
    expect(contactService.markMessagesProcessed).toHaveBeenCalled()
    expect(messageProcessing.processClientMessage).not.toHaveBeenCalled()
  })

  it('throws provider failures for delayed retry instead of sending a generic reply', async () => {
    const { processor, contactService, notifications } = setup()

    await expect(
      processor.process({
        data: { clientId: 459 },
        attemptsMade: 0,
        opts: { attempts: 4 },
        id: 'reply-459',
      } as any),
    ).rejects.toThrow('providers unavailable')

    expect(contactService.sendMessage).not.toHaveBeenCalled()
    expect(contactService.markMessagesProcessed).not.toHaveBeenCalled()
    expect(notifications.create).not.toHaveBeenCalled()
  })
})
