'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, MessageCircle, UserRound } from 'lucide-react'
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

  return <section aria-label="Comments and replies" className="border-t border-slate-200 bg-white px-4 pb-4 pt-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageCircle className="h-4 w-4" />Comments &amp; replies</h3>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>{busy ? 'Loading…' : 'Refresh'}</Button>
    </div>
    <p className="mt-1 text-xs text-slate-500">Captured by ChatPilot. Refresh to check for new activity.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {!busy && !error && items.length === 0 && <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">No captured comments yet. Add a comment on the published post, then refresh.</p>}
    <div className="mt-4 max-h-[36rem] space-y-4 overflow-y-auto" aria-live="polite">
      {items.map(item => <article key={item.id}>
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600"><UserRound className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="inline-block max-w-full rounded-2xl bg-slate-100 px-3 py-2">
              <p className="text-[13px] font-semibold leading-4 text-slate-900">{item.author || 'Name not provided'}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">{item.text || 'Comment text unavailable'}</p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 px-2 text-[11px] text-slate-500">
              <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              <span className="capitalize">{item.platform}</span>
            </div>
          </div>
        </div>
        {item.reply && <div className="ml-10 mt-2 flex items-start gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Bot className="h-3.5 w-3.5" /></span>
          <div className="min-w-0 flex-1">
            <div className="inline-block max-w-full rounded-2xl bg-slate-100 px-3 py-2">
              <p className="text-[13px] font-semibold leading-4 text-slate-900">{item.account?.name || item.account?.username || 'ChatPilot'}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">{item.reply}</p>
            </div>
            <p className={`mt-1 px-2 text-[11px] ${item.action === 'replied' ? 'text-emerald-700' : item.action === 'failed' ? 'text-red-700' : 'text-slate-500'}`}>
              {statuses[item.action] || 'Reply not confirmed'}
            </p>
          </div>
        </div>}
        {!item.reply && <p className={`ml-10 mt-1 text-[11px] ${item.action === 'failed' ? 'text-red-700' : 'text-slate-500'}`}>{statuses[item.action] || 'Reply not confirmed'}</p>}
        {item.action === 'failed' && <p className="ml-10 mt-1 text-xs text-red-700">The reply could not be sent. Check the connected account in Social channels.</p>}
      </article>)}
    </div>
    {cursor && <Button type="button" variant="outline" className="mt-4" disabled={busy} onClick={() => void load(cursor)}>Load older comments</Button>}
  </section>
}
