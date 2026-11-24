'use client'

import Link from 'next/link'
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  deleteMedia,
  listMedia,
  MediaItem,
  uploadMedia,
} from '@/lib/media-client'
import { MEDIA_ACCEPT, MEDIA_LIMIT_SUMMARY } from '@/lib/media-policy'

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

  const load = useCallback(async () => {
    setError('')
    try {
      setItems(await listMedia())
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
      const item = await uploadMedia(file)
      setItems(current => [item, ...current.filter(existing => existing.key !== item.key)])
      setNotice(
        file.type === 'application/pdf'
          ? 'PDF uploaded. Property extraction and deduplication are running in the background.'
          : 'Media uploaded. Attach it to a property or use an image in the content composer.',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload the media file.')
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
      await deleteMedia(item.key)
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
            <p className="mt-0.5 text-sm text-muted-foreground">Store reusable property images and short video tours in Cloudflare R2.</p>
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
            ['1', 'Upload a JPEG, PNG, WebP, MP4, MOV, or property PDF below.'],
            ['2', 'Add it to a Property Vault record with verified facts and pricing.'],
            ['3', 'Let automation select an available property and prepare a draft.'],
            ['4', 'Review and approve the draft before its scheduled publishing time.'],
          ].map(([number, text]) => (
            <div key={number} className="rounded-xl border border-white/80 bg-white/80 p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{number}</span>
              <p className="mt-3 text-xs leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:p-6">
        <input ref={inputRef} type="file" accept={MEDIA_ACCEPT} onChange={handleFile} className="sr-only" />
        <div
          onDragEnter={event => { event.preventDefault(); setDragging(true) }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50/60'}`}
        >
          {uploading ? <Loader2 className="h-9 w-9 animate-spin text-emerald-600" /> : <UploadCloud className="h-9 w-9 text-emerald-600" />}
          <h3 className="mt-4 font-semibold text-slate-900">{uploading ? 'Uploading your media…' : 'Drop an image, video, or property PDF here'}</h3>
          <p className="mt-1 text-sm text-slate-500">{MEDIA_LIMIT_SUMMARY}</p>
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
            <p className="mt-1 text-sm text-slate-500">Each link is public so Meta can fetch approved media while publishing.</p>
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
                  {item.contentType === 'application/pdf' ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-red-50 text-red-700">
                      <FileText className="h-12 w-12" />
                      <span className="text-sm font-semibold">Property PDF</span>
                    </div>
                  ) : item.contentType.startsWith('video/') ? (
                    <video src={item.url} muted controls preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" />
                  )}
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
                    {item.contentType === 'application/pdf' ? (
                      <Link href="/properties" className={buttonVariants({ size: 'sm' })}><Send className="mr-2 h-4 w-4" />View extracted</Link>
                    ) : item.contentType.startsWith('video/') ? (
                      <Link href="/properties" className={buttonVariants({ size: 'sm' })}><Send className="mr-2 h-4 w-4" />Property Vault</Link>
                    ) : (
                      <Link href={`/content?image=${encodeURIComponent(item.url)}`} className={buttonVariants({ size: 'sm' })}><Send className="mr-2 h-4 w-4" />Use in content</Link>
                    )}
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
            <h4 className="mt-4 font-semibold text-slate-800">No uploaded media yet</h4>
            <p className="mt-1 text-sm text-slate-500">Upload the first property image or video and its reusable public link will appear here.</p>
          </div>
        )}
      </section>
    </div>
  )
}
