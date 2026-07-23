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
