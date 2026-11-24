import { NextRequest } from 'next/server'
import {
  companyMediaPrefix,
  getMediaBucket,
  mediaErrorResponse,
  publicMediaUrl,
  requireMediaUser,
} from '@/lib/server/media'
import { API_BASE_URL } from '@/lib/api-base'
import {
  SUPPORTED_MEDIA_TYPES,
  validateMediaFile,
} from '@/lib/media-policy'

function safeName(name: string) {
  const base = name.replace(/\.[^.]+$/, '')
  return base
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image'
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireMediaUser(request)
    const bucket = await getMediaBucket()
    const result = await bucket.list({
      prefix: companyMediaPrefix(user.company_id),
      limit: 100,
      include: ['customMetadata', 'httpMetadata'],
    })

    const items = result.objects
      .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
      .map(object => ({
        key: object.key,
        name: object.customMetadata?.originalName || object.key.split('/').at(-1) || 'image',
        size: object.size,
        uploadedAt: object.uploaded.toISOString(),
        contentType: object.httpMetadata?.contentType || 'image/jpeg',
        url: publicMediaUrl(request, object.key),
      }))

    const authorization = request.headers.get('authorization')
    if (authorization && items.length) {
      await fetch(`${API_BASE_URL}/companies/${user.company_id}/assets/register`, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      }).catch(() => undefined)
    }

    return Response.json({ items })
  } catch (error) {
    return mediaErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireMediaUser(request)
    const form = await request.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return Response.json({ message: 'Choose an image, video, or PDF to upload.' }, { status: 400 })
    }
    try {
      validateMediaFile(file)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected media file is not supported.'
      const status = SUPPORTED_MEDIA_TYPES.has(file.type) ? 413 : 415
      return Response.json({ message }, { status })
    }

    const extension = SUPPORTED_MEDIA_TYPES.get(file.type)!
    const key = `${companyMediaPrefix(user.company_id)}${crypto.randomUUID()}-${safeName(file.name)}.${extension}`
    const bucket = await getMediaBucket()

    await bucket.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        originalName: file.name.slice(0, 200),
        companyId: String(user.company_id),
      },
    })

    const item = {
      key,
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      contentType: file.type,
      url: publicMediaUrl(request, key),
    }
    const authorization = request.headers.get('authorization')
    if (authorization) {
      await fetch(`${API_BASE_URL}/companies/${user.company_id}/assets/register`, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(item),
      }).catch(() => undefined)
    }

    return Response.json({ item }, { status: 201 })
  } catch (error) {
    return mediaErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireMediaUser(request)
    const key = request.nextUrl.searchParams.get('key') || ''
    const prefix = companyMediaPrefix(user.company_id)

    if (!key.startsWith(prefix) || key.length <= prefix.length || key.includes('..')) {
      return Response.json({ message: 'That image does not belong to your media library.' }, { status: 403 })
    }

    const bucket = await getMediaBucket()
    const url = publicMediaUrl(request, key)
    await bucket.delete(key)
    const authorization = request.headers.get('authorization')
    if (authorization) {
      await fetch(`${API_BASE_URL}/companies/${user.company_id}/assets/unregister`, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      }).catch(() => undefined)
    }
    return Response.json({ deleted: true })
  } catch (error) {
    return mediaErrorResponse(error)
  }
}
