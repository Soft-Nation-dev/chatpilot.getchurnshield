'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import api from '@/lib/api'
import { setTokens } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AcceptInvitePage() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get('token')
    if (queryToken) setToken(queryToken)
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const response = await api.post('/auth/accept-invite', { token: token.trim(), password })
      setTokens(response.data.access_token, response.data.refresh_token)
      window.location.href = '/dashboard'
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not accept this invitation'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-glow">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Join your team</h1>
        <p className="mt-2 text-sm text-slate-500">Confirm the invitation code and create your password.</p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="space-y-1.5">
          <Label htmlFor="invite-token">Invitation code</Label>
          <Input id="invite-token" value={token} onChange={event => setToken(event.target.value)} required className="font-mono text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-password">Password</Label>
          <Input id="invite-password" type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={6} autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-confirm">Confirm password</Label>
          <Input id="invite-confirm" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength={6} autoComplete="new-password" />
        </div>
        <Button type="submit" disabled={loading || !token.trim()} className="w-full">{loading ? 'Joining…' : 'Accept invitation'}</Button>
        <p className="text-center text-xs text-slate-500">Already joined? <Link href="/login" className="font-medium text-emerald-700 hover:underline">Sign in</Link></p>
      </form>
    </motion.div>
  )
}
