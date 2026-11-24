export const MEDIA_MEGABYTE = 1024 * 1024

export const MEDIA_LIMITS = {
  image: 25 * MEDIA_MEGABYTE,
  document: 50 * MEDIA_MEGABYTE,
  video: 95 * MEDIA_MEGABYTE,
} as const

export const SUPPORTED_MEDIA_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['video/mp4', 'mp4'],
  ['video/quicktime', 'mov'],
  ['application/pdf', 'pdf'],
])

export const MEDIA_ACCEPT = [...SUPPORTED_MEDIA_TYPES.keys()].join(',')
export const PROPERTY_MEDIA_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
].join(',')
export const MEDIA_LIMIT_SUMMARY =
  'Images up to 25 MB · PDF up to 50 MB · MP4/MOV video up to 95 MB'

export type MediaKind = 'image' | 'document' | 'video'

export function mediaKind(contentType: string): MediaKind | null {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType === 'application/pdf') return 'document'
  return null
}

export function mediaLimitBytes(contentType: string): number | null {
  const kind = mediaKind(contentType)
  return kind ? MEDIA_LIMITS[kind] : null
}

export function validateMediaFile(file: Pick<File, 'size' | 'type'>): void {
  const maxBytes = mediaLimitBytes(file.type)
  if (!SUPPORTED_MEDIA_TYPES.has(file.type) || maxBytes === null) {
    throw new Error('Upload a JPEG, PNG, WebP, MP4, MOV, or PDF file.')
  }
  if (file.size < 1) throw new Error('The selected file is empty.')
  if (file.size > maxBytes) {
    const limitMb = Math.floor(maxBytes / MEDIA_MEGABYTE)
    const kind = mediaKind(file.type)
    const label = kind === 'document' ? 'PDF' : kind === 'video' ? 'video' : 'image'
    throw new Error(`The ${label} must be smaller than ${limitMb} MB.`)
  }
}
