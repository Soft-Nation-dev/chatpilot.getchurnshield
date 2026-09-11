import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import { graphBaseUrl, socialConfig } from '../social.config'

export type GraphResult = {
  success: boolean
  error: string | null
  isAuthError: boolean
  data: any
}

const INSTAGRAM_CONTAINER_POLL_ATTEMPTS = 15
const INSTAGRAM_CONTAINER_POLL_INTERVAL_MS = 2000

@Injectable()
export class GraphApiService {
  private readonly logger = new Logger(GraphApiService.name)

  async get(path: string, params: Record<string, any>): Promise<GraphResult> {
    try {
      const response = await axios.get(`${graphBaseUrl}/${path}`, {
        params,
        timeout: 20000,
      })
      return {
        success: true,
        error: null,
        isAuthError: false,
        data: response.data,
      }
    } catch (error) {
      return this.toError(error)
    }
  }

  async post(
    path: string,
    body: Record<string, any>,
    accessToken: string,
  ): Promise<GraphResult> {
    try {
      const response = await axios.post(
        `${graphBaseUrl}/${path}`,
        { ...body, access_token: accessToken },
        { timeout: 20000 },
      )
      return {
        success: true,
        error: null,
        isAuthError: false,
        data: response.data,
      }
    } catch (error) {
      return this.toError(error)
    }
  }

  async del(path: string, accessToken: string): Promise<GraphResult> {
    try {
      const response = await axios.delete(`${graphBaseUrl}/${path}`, {
        params: { access_token: accessToken },
        timeout: 20000,
      })
      return {
        success: true,
        error: null,
        isAuthError: false,
        data: response.data,
      }
    } catch (error) {
      return this.toError(error)
    }
  }

  replyToFacebookComment(
    commentId: string,
    message: string,
    accessToken: string,
  ) {
    return this.post(`${commentId}/comments`, { message }, accessToken)
  }

  replyToInstagramComment(
    commentId: string,
    message: string,
    accessToken: string,
  ) {
    return this.post(`${commentId}/replies`, { message }, accessToken)
  }

  sendMessengerMessage(
    pageId: string,
    recipientId: string,
    text: string,
    accessToken: string,
  ) {
    return this.post(
      `${pageId}/messages`,
      {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text },
      },
      accessToken,
    )
  }

  sendInstagramMessage(
    pageId: string,
    recipientId: string,
    text: string,
    accessToken: string,
  ) {
    return this.post(
      `${pageId}/messages`,
      {
        recipient: { id: recipientId },
        message: { text },
      },
      accessToken,
    )
  }

  privateReplyToComment(
    pageId: string,
    commentId: string,
    text: string,
    accessToken: string,
  ) {
    return this.post(
      `${pageId}/messages`,
      {
        recipient: { comment_id: commentId },
        message: { text },
      },
      accessToken,
    )
  }

  publishPagePost(
    pageId: string,
    message: string,
    imageUrl: string | null,
    accessToken: string,
  ) {
    return imageUrl
      ? this.post(
          `${pageId}/photos`,
          { url: imageUrl, caption: message },
          accessToken,
        )
      : this.post(`${pageId}/feed`, { message }, accessToken)
  }

  async publishInstagramPost(
    igUserId: string,
    caption: string,
    imageUrl: string,
    accessToken: string,
  ): Promise<GraphResult> {
    const container = await this.post(
      `${igUserId}/media`,
      { image_url: imageUrl, caption },
      accessToken,
    )

    if (!container.success || !container.data?.id) return container

    const ready = await this.waitForInstagramContainer(
      container.data.id,
      accessToken,
    )
    if (!ready.success) return ready

    return this.post(
      `${igUserId}/media_publish`,
      { creation_id: container.data.id },
      accessToken,
    )
  }

  private async waitForInstagramContainer(
    containerId: string,
    accessToken: string,
  ): Promise<GraphResult> {
    let lastStatus = 'UNKNOWN'

    for (
      let attempt = 0;
      attempt < INSTAGRAM_CONTAINER_POLL_ATTEMPTS;
      attempt++
    ) {
      const result = await this.get(containerId, {
        fields: 'status_code',
        access_token: accessToken,
      })
      if (!result.success) return result

      lastStatus = String(result.data?.status_code || 'UNKNOWN').toUpperCase()
      if (lastStatus === 'FINISHED') return result

      if (lastStatus === 'ERROR' || lastStatus === 'EXPIRED') {
        return {
          success: false,
          error: `instagram media container ${containerId} entered ${lastStatus} status`,
          isAuthError: false,
          data: result.data,
        }
      }

      if (attempt < INSTAGRAM_CONTAINER_POLL_ATTEMPTS - 1) {
        await this.wait(INSTAGRAM_CONTAINER_POLL_INTERVAL_MS)
      }
    }

    return {
      success: false,
      error: `instagram media container ${containerId} was not ready after ${INSTAGRAM_CONTAINER_POLL_ATTEMPTS} checks (last status: ${lastStatus})`,
      isAuthError: false,
      data: { id: containerId, status_code: lastStatus },
    }
  }

  private wait(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
  }

  subscribePage(pageId: string, accessToken: string) {
    return this.post(
      `${pageId}/subscribed_apps`,
      { subscribed_fields: 'feed,messages,messaging_postbacks' },
      accessToken,
    )
  }

  unsubscribePage(pageId: string, accessToken: string) {
    return this.del(`${pageId}/subscribed_apps`, accessToken)
  }

  exchangeCodeForToken(code: string) {
    return this.get('oauth/access_token', {
      client_id: socialConfig.appId,
      client_secret: socialConfig.appSecret,
      redirect_uri: socialConfig.oauthRedirectUri,
      code,
    })
  }

  exchangeForLongLivedToken(shortLivedToken: string) {
    return this.get('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: socialConfig.appId,
      client_secret: socialConfig.appSecret,
      fb_exchange_token: shortLivedToken,
    })
  }

  listPages(userAccessToken: string) {
    return this.get('me/accounts', {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      access_token: userAccessToken,
    })
  }

  private toError(error: any): GraphResult {
    const graphError = error?.response?.data?.error
    const code = graphError?.code
    const subcode = graphError?.error_subcode
    const isAuthError =
      code === 190 || code === 102 || subcode === 458 || subcode === 463

    const message = graphError
      ? JSON.stringify(graphError)
      : error?.message || 'graph request failed'

    this.logger.error('Graph API request failed', message)

    return { success: false, error: message, isAuthError, data: null }
  }
}
