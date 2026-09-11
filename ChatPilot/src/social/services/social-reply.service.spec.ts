import {
  SOCIAL_EVENT_TYPE,
  SOCIAL_PLATFORM,
} from '../constants/social.constants'
import { SocialReplyService } from './social-reply.service'

describe('SocialReplyService', () => {
  it('sends an Instagram DM through the linked Facebook Page', async () => {
    const graph = {
      sendInstagramMessage: jest.fn().mockResolvedValue({ success: true }),
    }
    const service = new SocialReplyService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      graph as any,
    )

    await (service as any).dispatch(
      {
        event_type: SOCIAL_EVENT_TYPE.DM,
        platform: SOCIAL_PLATFORM.INSTAGRAM,
        external_id: 'event-1',
        external_user_id: 'instagram-scoped-recipient-1',
      },
      {
        external_id: 'instagram-user-1',
        page_id: 'page-1',
        ig_user_id: 'instagram-user-1',
      },
      'Hello from ChatPilot',
      'page-token',
    )

    expect(graph.sendInstagramMessage).toHaveBeenCalledWith(
      'page-1',
      'instagram-scoped-recipient-1',
      'Hello from ChatPilot',
      'page-token',
    )
  })
})
