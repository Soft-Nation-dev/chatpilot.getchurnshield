import { getAccessToken } from './auth'

export type MediaItem = {
  key: string
  name: string
  size: number
  uploadedAt: string
  contentType: string
  url: string
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function message(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: string }
    return body.message || fallback
  } catch {
    return fallback
  }
}

export async function uploadMedia(file: File): Promise<MediaItem> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/media', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!response.ok) {
    throw new Error(await message(response, 'Could not upload this media file.'))
  }
  const body = await response.json() as { item: MediaItem }
  return body.item
}

export async function listMedia(): Promise<MediaItem[]> {
  const response = await fetch('/api/media', {
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(await message(response, 'Could not load the media library.'))
  }
  const body = await response.json() as { items?: MediaItem[] }
  return Array.isArray(body.items) ? body.items : []
}
