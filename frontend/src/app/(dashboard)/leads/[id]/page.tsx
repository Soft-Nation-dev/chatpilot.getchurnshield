'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/context/auth-context'
import api from '@/lib/api'
import { Lead, Message } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from 'lucide-react'

const CHAT_STATE_LABELS: Record<string, string> = {
  NEW: 'New', QUALIFYING: 'Qualifying', QUALIFIED: 'Qualified',
  INSPECTION_PENDING: 'Inspection pending', INSPECTION_BOOKED: 'Inspection booked',
  HUMAN_TAKEOVER: 'Human takeover', CONCLUDED_CLOSED: 'Closed', COLD_LEAD: 'Cold lead',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="text-sm text-slate-700 text-right break-all">{value || '—'}</span>
    </div>
  )
}

export default function LeadViewPage() {
  const { user } = useAuth()
  const params = useParams()
  const leadId = params.id as string
  const companyId = user?.company_id
  const [lead, setLead] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [aiSending, setAiSending] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchLead = useCallback(async () => {
    if (!companyId || !leadId) return
    try {
      const res = await api.get(`/companies/${companyId}/leads/${leadId}`)
      setLead(res.data.lead)
      setMessages(Array.isArray(res.data.messages) ? res.data.messages : [])
    } catch {}
  }, [companyId, leadId])

  useEffect(() => { fetchLead() }, [fetchLead])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    const interval = setInterval(fetchLead, 8000)
    return () => clearInterval(interval)
  }, [fetchLead])

  const displayName = lead?.name || (lead?.phone ? `+${lead.phone}` : 'Lead')
  const formatTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const sendMessage = async () => {
    if (!companyId || !leadId || !draft.trim()) return
    setSending(true)
    try {
      await api.post(`/companies/${companyId}/leads/${leadId}/message`, { text: draft.trim() })
      setDraft('')
      setTimeout(fetchLead, 2500)
    } catch {}
    setSending(false)
  }

  const askAi = async () => {
    if (!companyId || !leadId) return
    setAiSending(true)
    try {
      await api.post(`/companies/${companyId}/leads/${leadId}/ai-message`, {})
      setTimeout(fetchLead, 3000)
    } catch {}
    setTimeout(() => setAiSending(false), 1500)
  }

  const toggleBot = async () => {
    if (!companyId || !lead) return
    setTogglingBot(true)
    try {
      await api.put(`/companies/${companyId}/leads/${lead.id}/bot-toggle`, { is_bot_activated: !lead.is_bot_activated })
      setLead({ ...lead, is_bot_activated: !lead.is_bot_activated })
    } catch {}
    setTogglingBot(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/leads">
          <Button variant="ghost" size="sm" className="rounded-lg text-muted-foreground hover:text-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
          <p className="text-xs text-muted-foreground capitalize">{lead?.status}</p>
        </div>
        <Badge variant={lead?.is_bot_activated ? 'default' : 'secondary'} className={lead?.is_bot_activated ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}>
          AI {lead?.is_bot_activated ? 'On' : 'Off'}
        </Badge>
        <Switch checked={!!lead?.is_bot_activated} onCheckedChange={toggleBot} disabled={togglingBot}
          className={lead?.is_bot_activated ? '!bg-emerald-500' : '!bg-slate-300'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 h-fit">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Details</h3>
          <Row label="Phone" value={lead?.phone ? `+${lead.phone}` : undefined} />
          <Row label="Email" value={lead?.email} />
          <Row label="Website" value={lead?.website ? <a href={lead.website} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">{lead.website}</a> : undefined} />
          <Row label="Address" value={lead?.address} />
          <Row label="Location" value={lead?.location_state} />
          <Row label="Source" value={lead?.source} />
          <Row label="Score" value={lead ? lead.qual_score.toFixed(2) : undefined} />
          <Row label="Notes" value={lead?.notes} />
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Automation health</h3>
              {lead?.contact_operation?.needs_review && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Needs attention</Badge>}
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Conversation state</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{CHAT_STATE_LABELS[lead?.contact_operation?.chat_state || ''] || 'Not started'}</p>
              {lead?.contact_operation?.state_change_reason && <p className="mt-1 text-xs text-slate-500">{lead.contact_operation.state_change_reason}</p>}
            </div>
            <div className="mt-3 space-y-2">
              {(lead?.contact_operation?.automation_events || []).slice(0, 4).map(event => {
                const Icon = event.status === 'succeeded' ? CheckCircle2 : event.status === 'failed' ? AlertTriangle : event.status === 'retrying' ? RefreshCw : Clock3
                const tone = event.status === 'succeeded' ? 'text-emerald-700' : event.status === 'failed' ? 'text-red-700' : event.status === 'retrying' ? 'text-blue-700' : 'text-amber-700'
                return <div key={event.id} className="flex items-start gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
                  <div className="min-w-0"><p className="font-medium capitalize text-slate-700">{event.job_type.replaceAll('_', ' ')} · {event.status}</p><p className="text-slate-400">Attempt {event.attempt}/{event.max_attempts}</p>{event.error_message && <p className="mt-1 line-clamp-2 text-red-600">The AI or delivery provider did not complete this run. Retry it from Chats, or take over if it is urgent.</p>}</div>
                </div>
              })}
              {lead?.contact_id && !lead.contact_operation?.automation_events?.length && <p className="text-xs text-slate-400">No automation run has been recorded yet.</p>}
              {!lead?.contact_id && <p className="text-xs text-slate-400">Automation history starts after first contact.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 lg:col-span-2 flex flex-col">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Conversation</h3>
          <div className="flex-1 max-h-[440px] overflow-auto space-y-2 rounded-xl bg-[#f0f2f5] p-4">
            {messages.map((msg, mi) => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(mi * 0.02, 0.3) }}
                className={`flex ${msg.author_type === 'human' ? 'justify-start' : 'justify-end'}`}>
                <div className={`relative max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                  msg.author_type === 'human' ? 'bg-white text-foreground rounded-tl-md'
                    : msg.author_type === 'user_whatsapp' ? 'bg-blue-500 text-white rounded-tr-md' : 'bg-emerald-500 text-white rounded-tr-md'}`}>
                  {msg.author_type !== 'human' && (
                    <p className={`text-[10px] font-medium mb-0.5 ${msg.author_type === 'user_whatsapp' ? 'text-blue-200' : 'text-emerald-200'}`}>
                      {msg.author_type === 'user_whatsapp' ? 'You' : 'AI Bot'}
                    </p>
                  )}
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                  <p className={`text-[10px] mt-1 text-right ${msg.author_type === 'human' ? 'text-slate-400' : msg.author_type === 'user_whatsapp' ? 'text-blue-200' : 'text-emerald-200'}`}>
                    {msg.sent_at ? formatTime(msg.sent_at) : ''}
                  </p>
                </div>
              </motion.div>
            ))}
            {messages.length === 0 && <p className="text-center text-sm text-muted-foreground py-16">No messages yet. Send one below or ask the AI to open.</p>}
            <div ref={bottomRef} />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <Textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Type a message to this lead…"
              className="min-h-[46px] max-h-40 flex-1 rounded-xl border-slate-200 resize-none text-sm"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} />
            <Button variant="outline" className="h-11 rounded-xl" onClick={askAi} disabled={aiSending}>
              {aiSending ? 'Queued…' : 'Ask AI'}
            </Button>
            <Button className="h-11 rounded-xl gradient-primary text-white hover:opacity-90" onClick={sendMessage} disabled={sending || !draft.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
