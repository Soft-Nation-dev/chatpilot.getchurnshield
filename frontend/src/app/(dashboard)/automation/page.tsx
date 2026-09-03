'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Facebook,
  Instagram,
  Loader2,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Warehouse,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AutomationSettings = {
  enabled: boolean
  posts_per_day: number
  posting_times: string[] | null
  posting_days: number[] | null
  platforms: string
  approval_required: boolean
  property_ratio: number
  min_reuse_days: number
  timezone: string
}

const defaults: AutomationSettings = {
  enabled: false,
  posts_per_day: 2,
  posting_times: ['09:00', '18:00'],
  posting_days: [1, 2, 3, 4, 5, 6, 7],
  platforms: 'facebook,instagram',
  approval_required: true,
  property_ratio: 100,
  min_reuse_days: 14,
  timezone: 'Africa/Lagos',
}

const weekdays = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun'],
] as const

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
    <span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span></span>
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} /></button>
  </label>
}

export default function ContentAutomationPage() {
  const { user } = useAuth()
  const companyId = user?.company_id
  const [settings, setSettings] = useState<AutomationSettings>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const response = await api.get(`/companies/${companyId}/content-automation`)
      setSettings({ ...defaults, ...response.data })
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not load content automation settings.'))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const selectedPlatforms = useMemo(() => settings.platforms.split(',').map(item => item.trim()), [settings.platforms])
  const times = [...(settings.posting_times || defaults.posting_times || [])]
  while (times.length < settings.posts_per_day) times.push(['09:00', '18:00', '20:00'][times.length])

  const update = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => {
    setSettings(current => ({ ...current, [key]: value }))
  }

  const togglePlatform = (platform: string) => {
    const next = selectedPlatforms.includes(platform)
      ? selectedPlatforms.filter(item => item !== platform)
      : [...selectedPlatforms, platform]
    if (!next.length) return
    update('platforms', ['facebook', 'instagram'].filter(item => next.includes(item)).join(','))
  }

  const toggleDay = (day: number) => {
    const current = settings.posting_days || []
    if (current.includes(day) && current.length === 1) return
    update('posting_days', current.includes(day) ? current.filter(item => item !== day) : [...current, day].sort())
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...settings,
        posting_times: times.slice(0, settings.posts_per_day),
        posting_days: settings.posting_days || defaults.posting_days,
      }
      const response = await api.put(`/companies/${companyId}/content-automation`, payload)
      setSettings({ ...defaults, ...response.data })
      setNotice('Automation settings saved. Approval remains required unless you explicitly turn it off.')
      return true
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not save automation settings.'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setError('')
    setNotice('')
    try {
      if (!(await save())) return
      const response = await api.post(`/companies/${companyId}/content-automation/run-now`)
      const created = Number(response.data?.created || 0)
      setNotice(created
        ? `${created} draft${created === 1 ? '' : 's'} created. Open Content Approval to review them.`
        : 'The upcoming time slots already have drafts. No duplicates were created.')
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not generate the automatic content plan. Make sure the Vault has an available property with an image.'))
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>

  return <div className="space-y-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><CalendarClock className="h-5 w-5" /></div><div><h2 className="text-2xl font-bold text-foreground">Content Automation</h2><p className="mt-0.5 text-sm text-muted-foreground">ChatPilot selects properties, prepares drafts and waits for your approval.</p></div></div>
      <div className="flex gap-2"><Link href="/properties" className={buttonVariants({ variant: 'outline' })}><Warehouse className="mr-2 h-4 w-4" />Property Vault</Link><Link href="/content" className={buttonVariants({ variant: 'outline' })}>Content Approval</Link></div>
    </div>

    {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

    <section className="grid gap-4 md:grid-cols-3">
      {[{ icon: Warehouse, title: '1. Fill the Vault', text: 'Add verified property facts and upload reusable photos or video.' }, { icon: Sparkles, title: '2. AI prepares drafts', text: 'Properties are rotated so the same listing is not repeated too often.' }, { icon: ShieldCheck, title: '3. You approve', text: 'Nothing publishes until an approved draft reaches its scheduled time.' }].map(item => <div key={item.title} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><item.icon className="h-5 w-5 text-emerald-600" /><h3 className="mt-4 text-sm font-semibold text-slate-900">{item.title}</h3><p className="mt-2 text-xs leading-relaxed text-slate-500">{item.text}</p></div>)}
    </section>

    <form onSubmit={save} className="space-y-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:p-6">
        <h3 className="font-semibold text-slate-900">Safety and status</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Toggle checked={settings.enabled} onChange={value => update('enabled', value)} label="Automatic draft planning" description="When enabled, ChatPilot checks hourly and fills upcoming posting slots." />
          <Toggle checked={settings.approval_required} onChange={value => update('approval_required', value)} label="Require human approval" description="Recommended. Drafts remain blocked until a team member approves them." />
        </div>
        {!settings.approval_required && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>Automatic publishing enabled:</strong> future generated posts will be approved automatically and can publish at their scheduled time.</div>}
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:p-6">
        <div><h3 className="font-semibold text-slate-900">Posting schedule</h3><p className="mt-1 text-sm text-slate-500">Times use the company time zone. The planner creates only future, non-duplicate slots.</p></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="posts-per-day">Posts per day</Label><select id="posts-per-day" value={settings.posts_per_day} onChange={event => update('posts_per_day', Number(event.target.value))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value={1}>1 post</option><option value={2}>2 posts</option><option value={3}>3 posts</option></select></div>
          <div className="space-y-2"><Label htmlFor="timezone">Time zone</Label><Input id="timezone" value={settings.timezone} onChange={event => update('timezone', event.target.value)} placeholder="Africa/Lagos" /></div>
        </div>
        <div className="mt-5 space-y-2"><Label>Posting times</Label><div className="grid gap-3 sm:grid-cols-3">{times.slice(0, settings.posts_per_day).map((time, index) => <div key={index} className="relative"><Clock3 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input type="time" value={time} onChange={event => { const next = [...times]; next[index] = event.target.value; update('posting_times', next) }} className="pl-9" /></div>)}</div></div>
        <div className="mt-5 space-y-2"><Label>Posting days</Label><div className="flex flex-wrap gap-2">{weekdays.map(([day, label]) => { const selected = (settings.posting_days || []).includes(day); return <button key={day} type="button" onClick={() => toggleDay(day)} className={`h-9 min-w-12 rounded-lg border px-3 text-xs font-semibold transition-colors ${selected ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>{label}</button> })}</div></div>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:p-6">
        <h3 className="font-semibold text-slate-900">Content selection</h3>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-2"><Label>Platforms</Label><div className="flex gap-2"><button type="button" onClick={() => togglePlatform('facebook')} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium ${selectedPlatforms.includes('facebook') ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}><Facebook className="h-4 w-4" />Facebook{selectedPlatforms.includes('facebook') && <CheckCircle2 className="h-3.5 w-3.5" />}</button><button type="button" onClick={() => togglePlatform('instagram')} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium ${selectedPlatforms.includes('instagram') ? 'border-pink-300 bg-pink-50 text-pink-700' : 'border-slate-200 text-slate-500'}`}><Instagram className="h-4 w-4" />Instagram{selectedPlatforms.includes('instagram') && <CheckCircle2 className="h-3.5 w-3.5" />}</button></div></div>
          <div className="space-y-2"><Label htmlFor="reuse">Minimum days before reusing a property</Label><Input id="reuse" type="number" min="0" max="90" value={settings.min_reuse_days} onChange={event => update('min_reuse_days', Number(event.target.value))} /></div>
          <div className="space-y-2 lg:col-span-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="property-ratio">Property showcase share</Label><span className="text-sm font-semibold text-emerald-700">{settings.property_ratio}%</span></div><input id="property-ratio" type="range" min="0" max="100" step="25" value={settings.property_ratio} onChange={event => update('property_ratio', Number(event.target.value))} className="w-full accent-emerald-600" /><p className="text-xs text-slate-400">The remaining posts are educational tips, FAQs and buyer guidance.</p></div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-3"><Button type="submit" variant="outline" disabled={saving || running}>{saving && !running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save settings</Button><Button type="button" onClick={runNow} disabled={saving || running}>{running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Generate next plan now</Button></div>
    </form>
  </div>
}
