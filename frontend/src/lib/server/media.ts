import { getCloudflareContext } from '@opennextjs/cloudflare'
import { API_BASE_URL } from '@/lib/api-base'

export type MediaObject = {
  key: string
  size: number
  uploaded: Date
  httpEtag: string
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
  writeHttpMetadata(headers: Headers): void
}

type MediaObjectBody = MediaObject & { body: ReadableStream<Uint8Array> }

type MediaBucket = {
  list(options: { prefix: string; limit: number; include: string[] }): Promise<{ objects: MediaObject[] }>
  put(key: string, value: ArrayBuffer | ReadableStream<Uint8Array>, options: {
    httpMetadata: { contentType: string; cacheControl: string }
    customMetadata: Record<string, string>
  }): Promise<MediaObject | null>
  get(key: string): Promise<MediaObjectBody | null>
  head(key: string): Promise<MediaObject | null>
  delete(key: string): Promise<void>
}

type AuthenticatedUser = {
  company_id: number
}

export async function getMediaBucket() {
  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as CloudflareEnv & { MEDIA_BUCKET?: MediaBucket }).MEDIA_BUCKET
  if (!bucket) {
    throw new Error('The Cloudflare media bucket is not configured.')
  }
  return bucket
}

export async function requireMediaUser(request: Request): Promise<AuthenticatedUser> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new MediaAuthError('Please sign in to manage your media.', 401)
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { authorization },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new MediaAuthError(
      response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Could not verify your account.',
      response.status === 401 ? 401 : 502,
    )
  }

  const body = await response.json() as { data?: AuthenticatedUser } & Partial<AuthenticatedUser>
  const user = body.data || body
  const companyId = user.company_id
  if (!Number.isInteger(companyId) || companyId === undefined || companyId < 1) {
    throw new MediaAuthError('Your account is not linked to a company.', 403)
  }

  return { company_id: companyId }
}

export class MediaAuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function companyMediaPrefix(companyId: number) {
  return `companies/${companyId}/`
}

export function publicMediaUrl(request: Request, key: string) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return `${new URL(request.url).origin}/media/${encodedKey}`
}

export function mediaErrorResponse(error: unknown) {
  const status = error instanceof MediaAuthError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Media request failed.'
  return Response.json({ message }, { status })
}
