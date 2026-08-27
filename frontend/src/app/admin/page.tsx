'use client'

import { useEffect, useState, useCallback } from 'react'
import { API_BASE_URL } from '@/lib/api-base'

interface AdminCompany {
  id: number
  name: string
  phone: number
  monthly_lead_quota: number
  daily_lead_limit: number
  pool_cursor: number
  monthly_used: number
  daily_used: number
  total_leads: number
}

interface Draft {
  monthly: number | ''
  daily: number | ''
  assign: number | ''
}

const API = API_BASE_URL

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [companies, setCompanies] = useState<AdminCompany[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const headers = useCallback((s: string) => ({ 'Content-Type': 'application/json', 'x-admin-secret': s }), [])

  const load = useCallback(async (s: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/admin/companies`, { headers: headers(s) })
      if (!res.ok) throw new Error('unauthorized')
      const json = await res.json()
      const list: AdminCompany[] = json?.data ?? json
      setCompanies(list)
      setDrafts(prev => {
        const next: Record<number, Draft> = {}
        list.forEach(c => {
          next[c.id] = { monthly: c.monthly_lead_quota, daily: c.daily_lead_limit, assign: prev[c.id]?.assign ?? 10 }
        })
        return next
      })
      setAuthed(true)
      localStorage.setItem('admin_secret', s)
    } catch {
      setNotice('Invalid admin secret.')
      setAuthed(false)
      localStorage.removeItem('admin_secret')
    }
    setLoading(false)
  }, [headers])

  useEffect(() => {
    const saved = localStorage.getItem('admin_secret')
    if (saved) { setSecret(saved); load(saved) }
  }, [load])

  const setDraft = (id: number, key: keyof Draft, value: number | '') => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  const saveLimits = async (id: number) => {
    const d = drafts[id]
    setBusyId(id)
    try {
      const res = await fetch(`${API}/admin/companies/${id}/limits`, {
        method: 'PUT',
        headers: headers(secret),
        body: JSON.stringify({
          monthly_lead_quota: d.monthly === '' ? 0 : Number(d.monthly),
          daily_lead_limit: d.daily === '' ? 0 : Number(d.daily),
        }),
      })
      if (!res.ok) throw new Error('failed')
      setNotice('Limits saved.')
      await load(secret)
    } catch { setNotice('Could not save limits.') }
    setBusyId(null)
    setTimeout(() => setNotice(''), 4000)
  }

  const assign = async (id: number) => {
    const d = drafts[id]
    setBusyId(id)
    setNotice('Assigning leads…')
    try {
      const res = await fetch(`${API}/admin/companies/${id}/assign`, {
        method: 'POST',
        headers: headers(secret),
        body: JSON.stringify({ count: d.assign === '' ? 1 : Number(d.assign) }),
      })
      if (!res.ok) throw new Error('failed')
      const json = await res.json()
      const r = json?.data ?? json
      setNotice(
        r?.quotaReached ? 'Company has reached its monthly quota.'
          : r?.dailyReached ? "Company has reached today's limit."
          : `Assigned ${r?.found ?? 0} lead(s).`,
      )
      await load(secret)
    } catch { setNotice('Could not assign leads.') }
    setBusyId(null)
    setTimeout(() => setNotice(''), 5000)
  }

  const signOut = () => {
    localStorage.removeItem('admin_secret')
    setAuthed(false)
    setSecret('')
    setCompanies([])
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin</h1>
            <p className="mt-1 text-sm text-slate-500">Enter the admin secret to manage companies.</p>
          </div>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(secret) }}
            placeholder="Admin secret"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => load(secret)}
            disabled={loading || !secret}
            className="h-11 w-full rounded-xl bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Enter'}
          </button>
          {notice && <p className="text-sm text-red-600">{notice}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin — Companies</h1>
            <p className="mt-1 text-sm text-slate-500">{companies.length} companies · set quotas, daily limits, and assign leads.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => load(secret)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh</button>
            <button onClick={signOut} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Sign out</button>
          </div>
        </div>

        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{notice}</div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">This month</th>
                <th className="px-4 py-3">Today</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Cursor</th>
                <th className="px-4 py-3">Monthly quota</th>
                <th className="px-4 py-3">Daily limit</th>
                <th className="px-4 py-3">Assign</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const d = drafts[c.id] ?? { monthly: c.monthly_lead_quota, daily: c.daily_lead_limit, assign: 10 }
                return (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-400">#{c.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{String(c.phone)}</td>
                    <td className="px-4 py-3 text-slate-700">{c.monthly_used} / {c.monthly_lead_quota}</td>
                    <td className="px-4 py-3 text-slate-700">{c.daily_used} / {c.daily_lead_limit}</td>
                    <td className="px-4 py-3 text-slate-700">{c.total_leads}</td>
                    <td className="px-4 py-3 text-slate-500">{c.pool_cursor}</td>
                    <td className="px-4 py-3">
                      <input type="number" min={0} value={d.monthly}
                        onChange={e => setDraft(c.id, 'monthly', e.target.value === '' ? '' : Number(e.target.value))}
                        className="h-9 w-24 rounded-lg border border-slate-200 px-2 outline-none focus:border-emerald-500" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} value={d.daily}
                          onChange={e => setDraft(c.id, 'daily', e.target.value === '' ? '' : Number(e.target.value))}
                          className="h-9 w-20 rounded-lg border border-slate-200 px-2 outline-none focus:border-emerald-500" />
                        <button onClick={() => saveLimits(c.id)} disabled={busyId === c.id}
                          className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">Save</button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} value={d.assign}
                          onChange={e => setDraft(c.id, 'assign', e.target.value === '' ? '' : Number(e.target.value))}
                          className="h-9 w-20 rounded-lg border border-slate-200 px-2 outline-none focus:border-emerald-500" />
                        <button onClick={() => assign(c.id)} disabled={busyId === c.id}
                          className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">Assign</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
