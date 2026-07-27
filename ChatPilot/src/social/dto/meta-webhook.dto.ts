export interface MetaFrom {
  id?: string
  name?: string
  username?: string
}

export interface MetaChangeValue {
  item?: string
  verb?: string
  comment_id?: string
  post_id?: string
  parent_id?: string
  created_time?: number
  from?: MetaFrom
  message?: string
  id?: string
  text?: string
  media?: { id?: string; media_product_type?: string }
}

export interface MetaChange {
  field?: string
  value?: MetaChangeValue
}

export interface MetaMessaging {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    attachments?: { type?: string; payload?: { url?: string } }[]
  }
  delivery?: any
  read?: any
  reaction?: any
  postback?: any
}

export interface MetaEntry {
  id?: string
  time?: number
  changes?: MetaChange[]
  messaging?: MetaMessaging[]
}

export interface MetaWebhookBody {
  object?: string
  entry?: MetaEntry[]
}

export interface NormalizedSocialEvent {
  platform: string
  eventType: string
  accountExternalId: string
  externalId: string
  externalUserId: string | null
  externalUserName: string | null
  postId: string | null
  parentId: string | null
  text: string | null
}
