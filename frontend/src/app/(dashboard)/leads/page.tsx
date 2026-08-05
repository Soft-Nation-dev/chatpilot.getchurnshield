'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/auth-context'
import api from '@/lib/api'
import { Lead, LeadUsage } from '@/lib/types'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/error'

const STATUSES = ['all', 'new', 'qualified', 'nurturing', 'handoff', 'closed', 'disqualified']

export default function LeadsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const companyId = user?.company_id
  const [leads, setLeads] = useState<Lead[]>([])
  const [status, setStatus] = useState('all')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [usage, setUsage] = useState<LeadUsage | null>(null)
  const [requestCount, setRequestCount] = useState(10)
  const [requesting, setRequesting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkMessage, setBulkMessage] = useState('')
  const [bulkAction, setBulkAction] = useState<'message' | 'ai' | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const fetchLeads = useCallback(async () => {
    if (!companyId) return
    try {
      const params: Record<string, string> = {}
      if (status !== 'all') params.status = status
      const res = await api.get(`/companies/${companyId}/leads`, { params })
      setLeads(Array.isArray(res.data) ? res.data : [])
    } catch {}
  }, [companyId, status])

  useEffect(() => { fetchLeads() }, [fetchLeads])
  const fetchUsage = useCallback(async () => {
    if (!companyId) return
    try {
      const response = await api.get(`/companies/${companyId}/leads/usage`)
      setUsage(response.data)
    } catch {}
  }, [companyId])
  useEffect(() => { fetchUsage() }, [fetchUsage])
  useEffect(() => {
    if (!companyId) return
    api.get(`/companies/${companyId}/connection_status`)
      .then(res => setConnected(res.data?.state === 'CONNECTED'))
      .catch(() => setConnected(false))
  }, [companyId])

  const notConnected = connected === false

  const requestLeads = async () => {
    if (!companyId) return
    setRequesting(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post(`/companies/${companyId}/leads/request`, { count: requestCount })
      setNotice(response.data?.started
        ? `Lead sourcing completed. ${response.data?.found ?? 0} leads found.`
        : response.data?.quotaReached
          ? 'The monthly lead quota has been reached.'
          : response.data?.dailyReached
            ? 'The daily lead limit has been reached.'
            : 'No lead sourcing job was started.')
      await Promise.all([fetchLeads(), fetchUsage()])
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not request leads'))
    } finally {
      setRequesting(false)
    }
  }

  const runBulkAction = async (action: 'message' | 'ai', all = false) => {
    if (!companyId || (!all && selectedIds.length === 0)) return
    if (action === 'message' && !bulkMessage.trim()) {
      setError('Enter a message before sending a manual outreach.')
      return
    }
    setBulkAction(action)
    setError('')
    setNotice('')
    try {
      const endpoint = action === 'message' ? 'blast' : 'ai-outreach'
      const payload = {
        all,
        ...(all ? {} : { leadIds: selectedIds }),
        ...(action === 'message' ? { text: bulkMessage.trim() } : {}),
      }
      const response = await api.post(`/companies/${companyId}/leads/${endpoint}`, payload)
      setNotice(`${response.data?.total ?? 0} lead${response.data?.total === 1 ? '' : 's'} queued for ${action === 'message' ? 'manual' : 'AI'} outreach.`)
      setSelectedIds([])
      if (action === 'message') setBulkMessage('')
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not queue outreach'))
    } finally {
      setBulkAction(null)
    }
  }

  const toggleSelected = (leadId: number) => {
    setSelectedIds(current => current.includes(leadId)
      ? current.filter(id => id !== leadId)
      : [...current, leadId])
  }

  const toggleBot = async (id: number, current: boolean) => {
    if (!companyId) return
    setTogglingId(id)
    try {
      await api.put(`/companies/${companyId}/leads/${id}/bot-toggle`, { is_bot_activated: !current })
      setLeads(prev => prev.map(l => l.id === id ? { ...l, is_bot_activated: !current } : l))
    } catch {}
    setTogglingId(null)
  }

  const badgeVariant = (s: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    if (s === 'qualified') return 'default'
    if (s === 'disqualified' || s === 'closed') return 'secondary'
    return 'outline'
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Leads</h2>
          <p className="mt-1 text-muted-foreground">{leads.length} leads</p>
        </div>
      </div>

      {notConnected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          ⚠️ WhatsApp is not connected. Connect it in Settings before messages can be delivered.
        </div>
      )}

      {(error || notice) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-semibold text-slate-900">Lead sourcing</h3><p className="text-sm text-slate-500">Pull qualified prospects from the configured source pool.</p></div>
            {usage && <Badge variant="outline">{usage.remaining} monthly left</Badge>}
          </div>
          {usage && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Monthly</p><p className="mt-1 font-semibold text-slate-800">{usage.used}/{usage.quota}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Today</p><p className="mt-1 font-semibold text-slate-800">{usage.daily_used}/{usage.daily_limit}</p></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-600">Available</p><p className="mt-1 font-semibold text-emerald-800">{Math.min(usage.remaining, usage.daily_remaining)}</p></div>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Input type="number" min={1} max={50} value={requestCount} onChange={event => setRequestCount(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} className="w-24" />
            <Button onClick={requestLeads} disabled={requesting || usage?.remaining === 0 || usage?.daily_remaining === 0}>{requesting ? 'Sourcing…' : 'Request leads'}</Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900">Outreach</h3><p className="text-sm text-slate-500">Queue messages for selected leads, or let AI open qualified conversations.</p></div><Badge variant="secondary">{selectedIds.length} selected</Badge></div>
          <Textarea value={bulkMessage} onChange={event => setBulkMessage(event.target.value)} placeholder="Write a manual outreach message…" className="mt-4 min-h-20" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => runBulkAction('message')} disabled={!selectedIds.length || bulkAction !== null}>{bulkAction === 'message' ? 'Queuing…' : 'Message selected'}</Button>
            <Button size="sm" variant="outline" onClick={() => runBulkAction('ai')} disabled={!selectedIds.length || bulkAction !== null}>AI outreach selected</Button>
            <Button size="sm" variant="outline" onClick={() => runBulkAction('ai', true)} disabled={bulkAction !== null || !leads.length} className="text-emerald-700">AI outreach all qualified</Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn('rounded-full px-3 py-1 text-sm capitalize transition',
              status === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200')}>
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><input type="checkbox" aria-label="Select all visible leads" checked={leads.length > 0 && selectedIds.length === leads.length} onChange={event => setSelectedIds(event.target.checked ? leads.map(lead => lead.id) : [])} className="accent-emerald-600" /></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>AI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map(lead => (
              <TableRow key={lead.id} className="hover:bg-slate-50">
                <TableCell><input type="checkbox" aria-label={`Select ${lead.name || 'lead'}`} checked={selectedIds.includes(lead.id)} onChange={() => toggleSelected(lead.id)} className="accent-emerald-600" /></TableCell>
                <TableCell>
                  <button onClick={() => router.push(`/leads/${lead.id}`)} className="font-medium text-emerald-700 hover:underline">
                    {lead.name || 'Unknown'}
                  </button>
                </TableCell>
                <TableCell className="text-sm">
                  {lead.phone ? `+${lead.phone}` : <span className="text-red-500">no WhatsApp</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{lead.location_state || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{lead.source || '—'}</TableCell>
                <TableCell><Badge variant={badgeVariant(lead.status)} className="capitalize">{lead.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={lead.is_bot_activated} onCheckedChange={() => toggleBot(lead.id, lead.is_bot_activated)}
                      disabled={togglingId === lead.id} className={lead.is_bot_activated ? '!bg-emerald-500' : '!bg-slate-300'} />
                    <span className="text-xs text-slate-400">{lead.is_bot_activated ? 'On' : 'Off'}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {leads.length === 0 && (
          <div className="py-16 text-center">
            <p className="font-medium text-muted-foreground">No leads yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Buyers who message your WhatsApp will appear here.</p>
          </div>
        )}
      </div>
    </div>
  )
}
