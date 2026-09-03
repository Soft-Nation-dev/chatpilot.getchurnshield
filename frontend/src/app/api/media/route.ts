import { NextRequest } from 'next/server'
import {
  companyMediaPrefix,
  getMediaBucket,
  mediaErrorResponse,
  publicMediaUrl,
  requireMediaUser,
} from '@/lib/server/media'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const SUPPORTED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['video/mp4', 'mp4'],
  ['video/quicktime', 'mov'],
])

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
      return Response.json({ message: 'Choose an image or video to upload.' }, { status: 400 })
    }
    if (!SUPPORTED_TYPES.has(file.type)) {
      return Response.json({ message: 'Upload a JPEG, PNG, WebP, MP4, or MOV file.' }, { status: 415 })
    }
    const isVideo = file.type.startsWith('video/')
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (file.size < 1 || file.size > maxBytes) {
      return Response.json({
        message: isVideo
          ? 'The video must be smaller than 50 MB.'
          : 'The image must be smaller than 10 MB.',
      }, { status: 413 })
    }

    const extension = SUPPORTED_TYPES.get(file.type)!
    const key = `${companyMediaPrefix(user.company_id)}${crypto.randomUUID()}-${safeName(file.name)}.${extension}`
    const bucket = await getMediaBucket()

    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        originalName: file.name.slice(0, 200),
        companyId: String(user.company_id),
      },
    })

    return Response.json({
      item: {
        key,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        contentType: file.type,
        url: publicMediaUrl(request, key),
      },
    }, { status: 201 })
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
    await bucket.delete(key)
    return Response.json({ deleted: true })
  } catch (error) {
    return mediaErrorResponse(error)
  }
}
