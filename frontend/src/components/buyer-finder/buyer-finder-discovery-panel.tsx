'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, MapPin, MessageCircle, Search, ShieldCheck } from 'lucide-react'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useAuth } from '@/context/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { BuyerFinderCandidate, BuyerFinderSettings } from '@/lib/types'

const STATES = [
  'Lagos',
  'Abuja',
  'Rivers',
  'Ogun',
  'Oyo',
  'Enugu',
  'Anambra',
  'Delta',
  'Edo',
  'Imo',
  'Akwa Ibom',
  'Cross River',
  'Kaduna',
  'Kano',
  'Plateau',
]
const CHANNELS = ['all', 'whatsapp', 'instagram', 'facebook'] as const

export function BuyerFinderDiscoveryPanel() {
  const { user } = useAuth()
  const companyId = user?.company_id
  const [settings, setSettings] = useState<BuyerFinderSettings | null>(null)
  const [feed, setFeed] = useState<BuyerFinderCandidate[]>([])
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('all')
  const [usage, setUsage] = useState({ used: 0, limit: 25, remaining: 25 })
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const [settingsResponse, feedResponse, usageResponse] = await Promise.all([
        api.get(`/companies/${companyId}/buyer-finder/settings`),
        api.get(`/companies/${companyId}/buyer-finder/feed`, {
          params: { channel, limit: 50 },
        }),
        api.get(`/companies/${companyId}/buyer-finder/usage`),
      ])
      setSettings(settingsResponse.data)
      setFeed(Array.isArray(feedResponse.data) ? feedResponse.data : [])
      setUsage(usageResponse.data)
      setDrafts(current => {
        const next = { ...current }
        for (const candidate of feedResponse.data || []) {
          if (next[candidate.id] === undefined) {
            next[candidate.id] = candidate.whatsapp_script || candidate.dm_script || ''
          }
        }
        return next
      })
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not load Buyer Finder'))
    }
  }, [channel, companyId])

  useEffect(() => {
    load()
  }, [load])

  const mode = settings?.operating_mode || 'off'
  const modeLabel =
    !settings?.global_enabled && settings?.enabled
      ? 'Pilot safety lock'
      : mode === 'live'
        ? 'Live'
        : mode === 'shadow'
          ? 'Shadow review'
          : 'Off'
  const modeClass =
    mode === 'live'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : mode === 'shadow'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'

  const selectedStates = useMemo(() => settings?.target_states || ['Lagos'], [settings])

  const toggleState = (state: string) => {
    if (!settings) return
    const selected = selectedStates.includes(state)
    if (selected && selectedStates.length === 1) return
    setSettings({
      ...settings,
      target_states: selected
        ? selectedStates.filter(value => value !== state)
        : [...selectedStates, state].slice(0, 8),
    })
  }

  const save = async () => {
    if (!companyId || !settings) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.put(`/companies/${companyId}/buyer-finder/settings`, {
        enabled: settings.enabled,
        shadow_mode: settings.shadow_mode,
        target_states: settings.target_states,
        exclusivity_limit: settings.exclusivity_limit,
        min_intent_score: settings.min_intent_score,
        daily_outreach_limit: settings.daily_outreach_limit,
      })
      setNotice(
        settings.global_enabled
          ? 'Buyer Finder settings saved.'
          : 'Settings saved. The production safety lock is still on, so no scraping credits can be used yet.',
      )
      await load()
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not save Buyer Finder settings'))
    } finally {
      setSaving(false)
    }
  }

  const record = async (candidate: BuyerFinderCandidate, action: string) => {
    if (!companyId) return false
    try {
      await api.post(`/companies/${companyId}/buyer-finder/allocations/${candidate.id}/actions`, {
        action,
        script: drafts[candidate.id] || undefined,
      })
      if (['contacted', 'dismissed', 'do_not_contact'].includes(action)) await load()
      return true
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not record Buyer Finder action'))
      return false
    }
  }

  const copyAndOpen = async (candidate: BuyerFinderCandidate) => {
    await navigator.clipboard.writeText(drafts[candidate.id] || '')
    await record(candidate, 'script_copied')
    if (candidate.prospect.profile_url) window.open(candidate.prospect.profile_url, '_blank', 'noopener,noreferrer')
    setNotice('Script copied. The prospect profile has been opened in a new tab.')
  }

  const openWhatsApp = async (candidate: BuyerFinderCandidate) => {
    if (!candidate.prospect.phone || candidate.status === 'shadow') return
    if (usage.remaining <= 0) {
      setError('Today’s Buyer Finder outreach safety limit has been reached.')
      return
    }
    if (!(await record(candidate, 'whatsapp_opened'))) return
    const phone = String(candidate.prospect.phone).replace(/\D/g, '')
    const text = encodeURIComponent(drafts[candidate.id] || '')
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer')
    setUsage(current => ({
      ...current,
      used: current.used + 1,
      remaining: Math.max(0, current.remaining - 1),
    }))
  }

  if (!settings) return null

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Buyer Finder</h3>
              <p className="text-sm text-slate-500">
                Find high-intent buyers from your connected Facebook and Instagram accounts.
              </p>
            </div>
          </div>
          <Badge variant="outline" className={modeClass}>
            {modeLabel}
          </Badge>
        </div>

        {(error || notice) && (
          <div
            className={`mt-4 rounded-xl border px-3 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
          >
            {error || notice}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Connected social sources</p>
              <p className="text-xs text-slate-500">
                {settings.sources.healthy_count > 0
                  ? `${settings.sources.healthy_count} connected account${settings.sources.healthy_count === 1 ? '' : 's'} ready. Buyers found there stay exclusive to your company.`
                  : settings.public_fallback_enabled
                    ? 'No healthy connected account. Buyer Finder will use the public discovery fallback.'
                    : 'Connect Facebook or Instagram to scan your own posts and comments.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {settings.sources.accounts.map(account => (
                <Badge
                  key={account.id}
                  variant="outline"
                  className={
                    account.status === 'active'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }
                >
                  {account.platform} · {account.name || account.username || account.status}
                </Badge>
              ))}
              {!settings.sources.accounts.length && <Badge variant="outline">No connected source</Badge>}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Target states</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STATES.map(state => (
                <button
                  key={state}
                  type="button"
                  onClick={() => toggleState(state)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${selectedStates.includes(state) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  {state}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium text-slate-700">Enable discovery</span>
                <span className="block text-xs text-slate-400">Requires the production safety lock</span>
              </span>
              <Switch checked={settings.enabled} onCheckedChange={enabled => setSettings({ ...settings, enabled })} />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium text-slate-700">Shadow review</span>
                <span className="block text-xs text-slate-400">Find leads without allowing outreach</span>
              </span>
              <Switch
                checked={settings.shadow_mode}
                onCheckedChange={shadow_mode => setSettings({ ...settings, shadow_mode })}
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>
              {usage.used} / {usage.limit} outreach actions today
            </span>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Buyer Finder settings'}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Buyer opportunities</h3>
            <p className="text-sm text-slate-500">
              Each candidate includes the original public enquiry and its property context.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map(value => (
              <button
                key={value}
                onClick={() => setChannel(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${channel === value ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-500'}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {feed.map(candidate => {
            const shadow = candidate.status === 'shadow'
            const profileName = candidate.prospect.name || candidate.prospect.handle || 'Property prospect'
            return (
              <article key={candidate.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-900">{profileName}</h4>
                      <Badge variant="outline" className="capitalize">
                        {candidate.channel}
                      </Badge>
                      {shadow && (
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                          Shadow only
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3.5 w-3.5" />
                      {candidate.location_state || 'Location not confirmed'} · score {candidate.intent_score}/10
                    </div>
                  </div>
                  {candidate.prospect.profile_url && (
                    <a
                      href={candidate.prospect.profile_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge
                    variant="outline"
                    className={
                      candidate.source.type === 'connected_social'
                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                        : ''
                    }
                  >
                    {candidate.source.type === 'connected_social'
                      ? `Your ${candidate.source.platform}`
                      : 'Public fallback'}
                    {candidate.source.name ? ` · ${candidate.source.name}` : ''}
                  </Badge>
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Original comment</p>
                  <p className="mt-1 text-sm text-slate-700">“{candidate.comment}”</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {candidate.post.property_type || 'Property'}
                    {candidate.post.specific_location ? ` · ${candidate.post.specific_location}` : ''}
                  </p>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Why it qualified: {candidate.intent_reason || 'High-intent property enquiry'}
                </p>
                <Textarea
                  value={drafts[candidate.id] || ''}
                  onChange={event =>
                    setDrafts(current => ({
                      ...current,
                      [candidate.id]: event.target.value,
                    }))
                  }
                  className="mt-3 min-h-24 text-sm"
                  aria-label={`Outreach script for ${profileName}`}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {candidate.channel === 'whatsapp' && candidate.prospect.phone && (
                    <Button size="sm" disabled={shadow || usage.remaining <= 0} onClick={() => openWhatsApp(candidate)}>
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      Chat on WhatsApp
                    </Button>
                  )}
                  {candidate.prospect.profile_url && (
                    <Button size="sm" variant="outline" disabled={shadow} onClick={() => copyAndOpen(candidate)}>
                      Copy script & open profile
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={shadow} onClick={() => record(candidate, 'contacted')}>
                    Mark contacted
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => record(candidate, 'dismissed')}>
                    Dismiss
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
        {!feed.length && (
          <div className="py-12 text-center">
            <Search className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-3 font-medium text-slate-600">No Buyer Finder candidates yet</p>
            <p className="mt-1 text-sm text-slate-400">
              The Lagos pilot will populate this feed after discovery is deliberately enabled.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
