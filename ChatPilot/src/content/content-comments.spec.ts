import { ContentController } from './content.controller'
import { encryptMessage } from 'src/common/crypto/message-crypto'

describe('Post comment access', () => {
  function setup() {
    const prisma = {
      content_posts: { findFirst: jest.fn().mockResolvedValue({ id: 10 }) },
      social_events: { findMany: jest.fn().mockResolvedValue([]) },
      social_accounts: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    const controller = new ContentController(prisma as any, access as any, null as any, null as any, null as any, null as any)
    return { prisma, access, controller }
  }

  it('denies reads before looking up events when workspace access fails', async () => {
    const { prisma, access, controller } = setup()
    access.assertAccess.mockRejectedValue(new Error('Forbidden'))
    await expect(controller.listComments({ user: {} }, 7, 10)).rejects.toThrow('Forbidden')
    expect(prisma.social_events.findMany).not.toHaveBeenCalled()
  })

  it('rejects a post outside the workspace', async () => {
    const { prisma, controller } = setup()
    prisma.content_posts.findFirst.mockResolvedValue(null)
    await expect(controller.listComments({ user: {} }, 7, 10)).rejects.toThrow('Content post not found')
    expect(prisma.social_events.findMany).not.toHaveBeenCalled()
  })

  it('decrypts comments without exposing ciphertext or changing failed reply status', async () => {
    process.env.JWT_SECRET = 'comment-test-key'
    const { prisma, controller } = setup()
    prisma.social_events.findMany.mockResolvedValue([
      { id: 9, platform: 'instagram', text: encryptMessage('What is the price?'), reply_text: 'Please send a DM.', action: 'failed', social_account_id: 3 },
      { id: 8, platform: 'facebook', text: 'enc:v1:broken', reply_text: null, action: 'received', social_account_id: null },
    ] as any)
    const result = await controller.listComments({ user: {} }, 7, 10, '11')
    expect(prisma.social_events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: 7, content_post_id: 10, event_type: 'comment', id: { lt: 11 } },
    }))
    expect(result.items[0]).toMatchObject({ text: 'What is the price?', action: 'failed', reply: 'Please send a DM.' })
    expect(result.items[1].text).toBeNull()
  })
})
