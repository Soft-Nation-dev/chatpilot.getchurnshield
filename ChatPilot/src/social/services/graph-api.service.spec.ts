import { GraphApiService, GraphResult } from './graph-api.service'

const success = (data: any): GraphResult => ({
  success: true,
  error: null,
  isAuthError: false,
  data,
})

describe('GraphApiService', () => {
  let service: GraphApiService

  beforeEach(() => {
    service = new GraphApiService()
    jest.spyOn(service as any, 'wait').mockResolvedValue(undefined)
  })

  describe('sendInstagramMessage', () => {
    it('uses the linked Facebook Page endpoint for Facebook Login messaging', async () => {
      const post = jest
        .spyOn(service, 'post')
        .mockResolvedValue(success({ message_id: 'message-1' }))

      const result = await service.sendInstagramMessage(
        'page-1',
        'instagram-scoped-recipient-1',
        'Hello from ChatPilot',
        'page-token',
      )

      expect(result).toEqual(success({ message_id: 'message-1' }))
      expect(post).toHaveBeenCalledWith(
        'page-1/messages',
        {
          recipient: { id: 'instagram-scoped-recipient-1' },
          message: { text: 'Hello from ChatPilot' },
        },
        'page-token',
      )
    })
  })

  describe('publishInstagramPost', () => {
    it('waits for the media container before publishing it', async () => {
      const post = jest
        .spyOn(service, 'post')
        .mockResolvedValueOnce(success({ id: 'container-1' }))
        .mockResolvedValueOnce(success({ id: 'instagram-post-1' }))
      const get = jest
        .spyOn(service, 'get')
        .mockResolvedValueOnce(success({ status_code: 'IN_PROGRESS' }))
        .mockResolvedValueOnce(success({ status_code: 'FINISHED' }))

      const result = await service.publishInstagramPost(
        'ig-user-1',
        'Test caption',
        'https://example.com/test.jpg',
        'page-token',
      )

      expect(result).toEqual(success({ id: 'instagram-post-1' }))
      expect(get).toHaveBeenCalledTimes(2)
      expect(get).toHaveBeenCalledWith('container-1', {
        fields: 'status_code',
        access_token: 'page-token',
      })
      expect(post).toHaveBeenNthCalledWith(
        2,
        'ig-user-1/media_publish',
        { creation_id: 'container-1' },
        'page-token',
      )
    })

    it('does not publish a container that enters an error state', async () => {
      const post = jest
        .spyOn(service, 'post')
        .mockResolvedValueOnce(success({ id: 'container-2' }))
      jest
        .spyOn(service, 'get')
        .mockResolvedValueOnce(success({ status_code: 'ERROR' }))

      const result = await service.publishInstagramPost(
        'ig-user-1',
        'Test caption',
        'https://example.com/test.jpg',
        'page-token',
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('ERROR')
      expect(post).toHaveBeenCalledTimes(1)
    })
  })
})
