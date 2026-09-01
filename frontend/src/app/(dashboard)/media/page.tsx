'use client'

import Link from 'next/link'
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Clipboard,
  ExternalLink,
  ImageIcon,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { getAccessToken } from '@/lib/auth'

type MediaItem = {
  key: string
  name: string
  size: number
  uploadedAt: string
  contentType: string
  url: string
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: string }
    return body.message || fallback
  } catch {
    return fallback
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MediaLibraryPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [deletingKey, setDeletingKey] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const authHeaders = (): Record<string, string> => {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await fetch('/api/media', { headers: authHeaders(), cache: 'no-store' })
      if (!response.ok) throw new Error(await responseMessage(response, 'Could not load your media library.'))
      const body = await response.json() as { items?: MediaItem[] }
      setItems(Array.isArray(body.items) ? body.items : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your media library.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const upload = async (files: FileList | File[]) => {
    const file = Array.from(files)[0]
    if (!file) return

    setUploading(true)
    setError('')
    setNotice('')
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/media', {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      })
      if (!response.ok) throw new Error(await responseMessage(response, 'Could not upload the image.'))
      const body = await response.json() as { item: MediaItem }
      setItems(current => [body.item, ...current.filter(item => item.key !== body.item.key)])
      setNotice('Image uploaded. Copy its link or send it directly to the content composer.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload the image.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) upload(event.target.files)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (!uploading) upload(event.dataTransfer.files)
  }

  const copyLink = async (item: MediaItem) => {
    try {
      await navigator.clipboard.writeText(item.url)
      setCopiedKey(item.key)
      window.setTimeout(() => setCopiedKey(''), 1800)
    } catch {
      setError('Could not copy automatically. Select the URL below and copy it manually.')
    }
  }

  const remove = async (item: MediaItem) => {
    if (!window.confirm(`Delete “${item.name}” from the media library? Existing posts using this URL may stop showing the image.`)) return
    setDeletingKey(item.key)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/media?key=${encodeURIComponent(item.key)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!response.ok) throw new Error(await responseMessage(response, 'Could not delete the image.'))
      setItems(current => current.filter(existing => existing.key !== item.key))
      setNotice('Image deleted.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the image.')
    } finally {
      setDeletingKey('')
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Media Library</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Upload images once and get a public URL that Instagram and Facebook can open.</p>
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <section className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-5 shadow-sm lg:p-6">
        <h3 className="font-semibold text-slate-900">How to use an image in a social post</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ['1', 'Upload a JPEG, PNG, or WebP image below. JPEG is recommended for Instagram.'],
            ['2', 'Wait for the image card and its public HTTPS link to appear.'],
            ['3', 'Click “Use in content” to place the link into a new draft automatically.'],
            ['4', 'Generate the draft, review it, then publish when you are ready.'],
          ].map(([number, text]) => (
            <div key={number} className="rounded-xl border border-white/80 bg-white/80 p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{number}</span>
              <p className="mt-3 text-xs leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:p-6">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} className="sr-only" />
        <div
          onDragEnter={event => { event.preventDefault(); setDragging(true) }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50/60'}`}
        >
          {uploading ? <Loader2 className="h-9 w-9 animate-spin text-emerald-600" /> : <UploadCloud className="h-9 w-9 text-emerald-600" />}
          <h3 className="mt-4 font-semibold text-slate-900">{uploading ? 'Uploading your image…' : 'Drop an image here'}</h3>
          <p className="mt-1 text-sm text-slate-500">JPEG, PNG, or WebP · maximum 10 MB</p>
          <Button className="mt-5" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Please wait' : 'Choose image'}
          </Button>
        </div>
      </section>

      {(error || notice) && (
        <div aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Your uploaded images</h3>
            <p className="mt-1 text-sm text-slate-500">Each link is public so Meta can fetch the image while publishing.</p>
          </div>
          <Link href="/content" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800">
            Open content composer <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : items.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map(item => (
              <article key={item.key} className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                <a href={item.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" />
                </a>
                <div className="space-y-4 p-4">
                  <div>
                    <h4 className="truncate text-sm font-semibold text-slate-900" title={item.name}>{item.name}</h4>
                    <p className="mt-1 text-xs text-slate-400">{formatBytes(item.size)} · {new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.uploadedAt))}</p>
                  </div>
                  <input readOnly value={item.url} onFocus={event => event.currentTarget.select()} aria-label={`Public URL for ${item.name}`} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 outline-none focus:border-emerald-400" />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyLink(item)}>
                      {copiedKey === item.key ? <Check className="mr-2 h-4 w-4 text-emerald-600" /> : <Clipboard className="mr-2 h-4 w-4" />}
                      {copiedKey === item.key ? 'Copied' : 'Copy link'}
                    </Button>
                    <Link href={`/content?image=${encodeURIComponent(item.url)}`} className={buttonVariants({ size: 'sm' })}><Send className="mr-2 h-4 w-4" />Use in content</Link>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-3">
                    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">Open image <ExternalLink className="h-3 w-3" /></a>
                    <button type="button" onClick={() => remove(item)} disabled={deletingKey === item.key} className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50">
                      {deletingKey === item.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <ImageIcon className="mx-auto h-8 w-8 text-slate-300" />
            <h4 className="mt-4 font-semibold text-slate-800">No uploaded images yet</h4>
            <p className="mt-1 text-sm text-slate-500">Upload your first image above and its reusable public link will appear here.</p>
          </div>
        )}
      </section>
    </div>
  )
}
