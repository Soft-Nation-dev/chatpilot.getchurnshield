import { getMediaBucket, type MediaObject } from '@/lib/server/media'

type RouteContext = { params: Promise<{ key: string[] }> }

function objectHeaders(object: MediaObject) {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('access-control-allow-origin', '*')
  headers.set('x-content-type-options', 'nosniff')
  return headers
}

function validKey(parts: string[]) {
  const key = parts.join('/')
  return key.startsWith('companies/') && !key.includes('..') ? key : null
}

export async function GET(_request: Request, context: RouteContext) {
  const key = validKey((await context.params).key)
  if (!key) return new Response('Not found', { status: 404 })

  const bucket = await getMediaBucket()
  const object = await bucket.get(key)
  if (!object) return new Response('Not found', { status: 404 })

  return new Response(object.body, { headers: objectHeaders(object) })
}

export async function HEAD(_request: Request, context: RouteContext) {
  const key = validKey((await context.params).key)
  if (!key) return new Response(null, { status: 404 })

  const bucket = await getMediaBucket()
  const object = await bucket.head(key)
  if (!object) return new Response(null, { status: 404 })

  return new Response(null, { headers: objectHeaders(object) })
}
