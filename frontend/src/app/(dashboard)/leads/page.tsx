'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/auth-context'
import api from '@/lib/api'
import { Lead } from '@/lib/types'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const STATUSES = ['all', 'new', 'qualified', 'nurturing', 'handoff', 'closed', 'disqualified']

export default function LeadsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const companyId = user?.company_id
  const [leads, setLeads] = useState<Lead[]>([])
  const [status, setStatus] = useState('all')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)

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
  useEffect(() => {
    if (!companyId) return
    api.get(`/companies/${companyId}/connection_status`)
      .then(res => setConnected(res.data?.state === 'CONNECTED'))
      .catch(() => setConnected(false))
  }, [companyId])

  const notConnected = connected === false

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
