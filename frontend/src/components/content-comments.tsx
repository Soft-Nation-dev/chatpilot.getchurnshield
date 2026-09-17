'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

type Comment = {
  id: number
  platform: string
  author: string | null
  text: string | null
  reply: string | null
  action: string
  created_at: string
  updated_at: string | null
  account: { name: string | null; username: string | null } | null
}

const statuses: Record<string, string> = {
  received: 'Processing', replied: 'Reply sent', failed: 'Reply failed',
  converted: 'WhatsApp enquiry recorded', skipped_low_intent: 'No automatic reply needed',
  skipped_disabled: 'Automatic replies disabled', skipped_rate_limited: 'Reply limit reached',
  skipped_bad_phone: 'WhatsApp contact unavailable',
  skipped_duplicate_author: 'Automatic reply skipped: repeat enquiry',
  unknown_account: 'Account unavailable',
}

export function ContentComments({ companyId, postId }: { companyId: number; postId: number }) {
  const [items, setItems] = useState<Comment[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async (before?: number, signal?: AbortSignal) => {
    setBusy(true)
    setError('')
    try {
      const response = await api.get(`/companies/${companyId}/content/${postId}/comments`, {
        params: before ? { before } : {}, signal,
      })
      if (signal?.aborted) return
      setItems(previous => before ? [...previous, ...response.data.items] : response.data.items)
      setCursor(response.data.next_cursor)
    } catch (cause) {
      if (!signal?.aborted) setError(getErrorMessage(cause, 'Could not load comments.'))
    } finally {
      if (!signal?.aborted) setBusy(false)
    }
  }, [companyId, postId])

  useEffect(() => {
    const controller = new AbortController()
    void load(undefined, controller.signal)
    return () => controller.abort()
  }, [load])

  return <section aria-label="Comments and replies" className="border-b border-slate-200 bg-slate-50 p-5">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-semibold text-slate-900">Comments &amp; replies</h3>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>{busy ? 'Loading…' : 'Refresh comments'}</Button>
    </div>
    <p className="mt-2 text-xs text-slate-500">Comments captured by ChatPilot. Older comments that were not received may be missing. Refresh to check for new comments and replies.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {!busy && !error && items.length === 0 && <p className="mt-4 text-sm text-slate-600">No captured comments yet. Add a comment on the published post, then refresh here.</p>}
    <div className="mt-4 max-h-[36rem] space-y-3 overflow-y-auto" aria-live="polite">
      {items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap justify-between gap-2 text-xs">
          <span className="font-medium capitalize text-slate-600">{item.platform} · {item.account?.username ? `@${item.account.username}` : item.account?.name || 'Connected account'}</span>
          <span className={item.action === 'replied' ? 'text-emerald-700' : item.action === 'failed' ? 'text-red-700' : 'text-slate-500'}>{statuses[item.action] || 'Reply not confirmed'}</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-900">{item.author || 'Name not provided'}</p>
        <time className="text-xs text-slate-400" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{item.text || 'Comment text unavailable'}</p>
        {item.reply && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600">{item.action === 'replied' ? 'ChatPilot reply · Sent' : item.action === 'converted' ? 'Recorded response · Send status unavailable' : 'Generated reply · Not sent'}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{item.reply}</p>
        </div>}
        {item.action === 'failed' && <p className="mt-2 text-xs text-red-700">The reply could not be sent. Check the connected account in Social channels.</p>}
      </article>)}
    </div>
    {cursor && <Button type="button" variant="outline" className="mt-4" disabled={busy} onClick={() => void load(cursor)}>Load older comments</Button>}
  </section>
}
