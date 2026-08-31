'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/context/auth-context'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SocialAccount = {
  id: number
  platform: 'facebook' | 'instagram' | string
  external_id: string
  page_id: string | null
  ig_user_id: string | null
  name: string | null
  username: string | null
  is_active: boolean
  subscribed_at: string | null
  token_expires_at: string | null
  last_error: string | null
  created_at: string
}

const EMPTY_MANUAL = {
  platform: 'facebook' as 'facebook' | 'instagram',
  external_id: '',
  page_id: '',
  ig_user_id: '',
  name: '',
  username: '',
  access_token: '',
}

export default function SocialSettingsPage() {
  const { user } = useAuth()
  const companyId = user?.company_id
  const isOwner = user?.role === 'owner'
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState(EMPTY_MANUAL)
  const [savingManual, setSavingManual] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const loadAccounts = useCallback(async () => {
    if (!companyId) return
    try {
      const response = await api.get(`/social/companies/${companyId}/accounts`)
      setAccounts(Array.isArray(response.data) ? response.data : [])
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not load social accounts'))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { loadAccounts() }, [loadAccounts])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') setNotice('Facebook connection completed successfully.')
    const oauthError = params.get('error')
    if (oauthError) setError(`Facebook connection failed: ${oauthError}`)
  }, [])

  const connectFacebook = async () => {
    setConnecting(true)
    setError('')
    try {
      const response = await api.get('/social/oauth/facebook/authorize')
      if (!response.data?.url) throw new Error('The backend did not return an authorization URL')
      window.location.href = response.data.url
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not start Facebook authorization'))
      setConnecting(false)
    }
  }

  const connectManual = async (event: FormEvent) => {
    event.preventDefault()
    if (!companyId || !isOwner) return
    setSavingManual(true)
    setError('')
    setNotice('')
    try {
      const payload = Object.fromEntries(
        Object.entries(manual).filter(([, value]) => value.trim() !== ''),
      )
      const response = await api.post(`/social/companies/${companyId}/accounts/manual`, payload)
      setNotice(response.data?.subscribed
        ? 'Social account connected and subscribed to Meta webhooks.'
        : `Account saved, but webhook subscription failed${response.data?.error ? `: ${response.data.error}` : '.'}`)
      setManual(EMPTY_MANUAL)
      setShowManual(false)
      await loadAccounts()
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not connect this social account'))
    } finally {
      setSavingManual(false)
    }
  }

  const disconnect = async (accountId: number) => {
    if (!companyId || !isOwner) return
    setDisconnectingId(accountId)
    setError('')
    try {
      await api.delete(`/social/companies/${companyId}/accounts/${accountId}`)
      await loadAccounts()
      setNotice('Social account disconnected.')
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not disconnect this account'))
    } finally {
      setDisconnectingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Social channels</h2>
          <p className="mt-1 text-muted-foreground">Connect Facebook Pages and Instagram business accounts for comments and DMs.</p>
        </div>
        {isOwner && <Button onClick={connectFacebook} disabled={connecting}>{connecting ? 'Opening Meta…' : 'Connect with Facebook'}</Button>}
      </div>

      {(error || notice) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
        <h3 className="font-semibold text-slate-900">How to connect Facebook and Instagram</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              number: '1',
              title: 'Prepare Meta',
              text: 'Use a Facebook account that is an admin of your Facebook Page. For Instagram, first link a Professional Instagram account to that Page.',
            },
            {
              number: '2',
              title: 'Authorize ChatPilot',
              text: 'Select Connect with Facebook, sign in to Meta, choose the Page you want to use, and approve every requested messaging and engagement permission.',
            },
            {
              number: '3',
              title: 'Confirm the connection',
              text: 'Meta returns you here. The Page and linked Instagram account should show Active and Webhook Subscribed before automated replies can run.',
            },
          ].map(item => (
            <div key={item.number} className="rounded-xl border border-white/80 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{item.number}</div>
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          If you see “meta not configured”, the server administrator must add META_APP_ID,
          META_APP_SECRET, META_VERIFY_TOKEN, and META_OAUTH_REDIRECT_URI on Hostinger, then restart the API.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {accounts.map((account, index) => (
          <motion.div key={account.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">{account.platform === 'instagram' ? 'IG' : 'f'}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-slate-900">{account.name || account.username || account.external_id}</p>
                    <Badge variant={account.is_active ? 'default' : 'secondary'}>{account.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs capitalize text-slate-500">{account.platform} · {account.username ? `@${account.username}` : account.external_id}</p>
                </div>
              </div>
              {isOwner && account.is_active && <Button variant="outline" size="sm" onClick={() => disconnect(account.id)} disabled={disconnectingId === account.id} className="text-red-600">Disconnect</Button>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
              <div><p className="text-slate-400">Webhook</p><p className="mt-0.5 font-medium text-slate-700">{account.subscribed_at ? 'Subscribed' : 'Not subscribed'}</p></div>
              <div><p className="text-slate-400">Page ID</p><p className="mt-0.5 truncate font-medium text-slate-700">{account.page_id || account.external_id}</p></div>
            </div>
            {account.last_error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{account.last_error}</p>}
          </motion.div>
        ))}
      </div>

      {!loading && !accounts.length && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-slate-700">No social accounts connected</p>
          <p className="mt-1 text-sm text-slate-500">Connect Meta to let the assistant respond to supported Facebook and Instagram activity.</p>
        </div>
      )}
      {loading && <div className="rounded-2xl border border-slate-200/60 bg-white p-8 text-center text-sm text-slate-500">Loading social accounts…</div>}

      {isOwner && (
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
          <button type="button" onClick={() => setShowManual(value => !value)} className="flex w-full items-center justify-between text-left">
            <div><h3 className="font-semibold text-slate-900">Advanced manual connection</h3><p className="text-sm text-slate-500">For administrators only: use a long-lived Page access token when OAuth is unavailable.</p></div>
            <span className="text-xl text-slate-400">{showManual ? '−' : '+'}</span>
          </button>
          {showManual && (
            <form onSubmit={connectManual} className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Platform</Label><select value={manual.platform} onChange={event => setManual(current => ({ ...current, platform: event.target.value as 'facebook' | 'instagram' }))} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select></div>
              <div className="space-y-1.5"><Label>External account ID</Label><Input value={manual.external_id} onChange={event => setManual(current => ({ ...current, external_id: event.target.value }))} required /></div>
              <div className="space-y-1.5"><Label>Facebook Page ID</Label><Input value={manual.page_id} onChange={event => setManual(current => ({ ...current, page_id: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Instagram business ID</Label><Input value={manual.ig_user_id} onChange={event => setManual(current => ({ ...current, ig_user_id: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Display name</Label><Input value={manual.name} onChange={event => setManual(current => ({ ...current, name: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Username</Label><Input value={manual.username} onChange={event => setManual(current => ({ ...current, username: event.target.value }))} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Long-lived Page access token</Label><Input type="password" value={manual.access_token} onChange={event => setManual(current => ({ ...current, access_token: event.target.value }))} required autoComplete="off" /><p className="text-xs text-slate-400">The backend encrypts this token before storing it.</p></div>
              <div className="md:col-span-2"><Button type="submit" disabled={savingManual}>{savingManual ? 'Connecting…' : 'Connect account'}</Button></div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
