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
import { Switch } from '@/components/ui/switch'

type TeamRole = 'owner' | 'manager' | 'agent'

type TeamMember = {
  id: number
  phone: string
  full_name: string | null
  role: TeamRole
  status: 'active' | 'invited' | 'revoked'
  revoked_at: string | null
  invite_expires_at: string | null
  last_login_at: string | null
  can_view_contact_phone: boolean
  created_at: string
}

export default function TeamPage() {
  const { user } = useAuth()
  const companyId = user?.company_id
  const canManageTeam = user?.role === 'owner' || user?.role === 'manager'
  const isOwner = user?.role === 'owner'
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'manager' | 'agent'>('agent')
  const [inviting, setInviting] = useState(false)
  const [inviteToken, setInviteToken] = useState('')

  const loadMembers = useCallback(async () => {
    if (!companyId || !canManageTeam) {
      setLoading(false)
      return
    }
    try {
      const response = await api.get(`/companies/${companyId}/team`)
      setMembers(Array.isArray(response.data) ? response.data : [])
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not load the team'))
    } finally {
      setLoading(false)
    }
  }, [companyId, canManageTeam])

  useEffect(() => { loadMembers() }, [loadMembers])

  const invite = async (event: FormEvent) => {
    event.preventDefault()
    if (!companyId) return
    setInviting(true)
    setError('')
    setSuccess('')
    try {
      const response = await api.post(`/companies/${companyId}/team/invite`, {
        phone: phone.trim(),
        full_name: fullName.trim() || undefined,
        role,
      })
      setInviteToken(response.data?.invite_token ?? '')
      setSuccess('Invitation created and queued for WhatsApp delivery.')
      setPhone('')
      setFullName('')
      await loadMembers()
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not invite this team member'))
    } finally {
      setInviting(false)
    }
  }

  const updateMember = async (
    member: TeamMember,
    changes: { role?: TeamRole; can_view_contact_phone?: boolean },
  ) => {
    if (!companyId || !isOwner) return
    setBusyId(member.id)
    setError('')
    try {
      const response = await api.patch(`/companies/${companyId}/team/${member.id}/role`, {
        role: changes.role ?? member.role,
        can_view_contact_phone: changes.can_view_contact_phone ?? member.can_view_contact_phone,
      })
      setMembers(current => current.map(item => item.id === member.id ? response.data : item))
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not update this team member'))
    } finally {
      setBusyId(null)
    }
  }

  const changeStatus = async (member: TeamMember, action: 'revoke' | 'restore') => {
    if (!companyId || !isOwner) return
    setBusyId(member.id)
    setError('')
    try {
      const response = await api.post(`/companies/${companyId}/team/${member.id}/${action}`)
      setMembers(current => current.map(item => item.id === member.id ? response.data : item))
    } catch (cause) {
      setError(getErrorMessage(cause, `Could not ${action} this team member`))
    } finally {
      setBusyId(null)
    }
  }

  if (!canManageTeam) {
    return (
      <div className="rounded-2xl border border-slate-200/60 bg-white p-8 text-center">
        <h2 className="text-xl font-bold text-slate-900">Team access is restricted</h2>
        <p className="mt-2 text-sm text-slate-500">Only owners and managers can view the company team.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Team</h2>
        <p className="mt-1 text-muted-foreground">Invite teammates and control access to customer data.</p>
      </div>

      {(error || success) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || success}
        </div>
      )}

      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={invite}
        className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
      >
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">Invite a teammate</h3>
          <p className="text-sm text-slate-500">They will receive an invitation link and code over WhatsApp.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_180px_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Full name</Label>
            <Input id="team-name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Ada Okafor" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-phone">WhatsApp phone</Label>
            <Input id="team-phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="2348012345678" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-role">Role</Label>
            <select id="team-role" value={role} onChange={event => setRole(event.target.value as 'manager' | 'agent')} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20">
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <Button type="submit" disabled={inviting}>{inviting ? 'Inviting…' : 'Send invite'}</Button>
        </div>
        {inviteToken && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            Backup invitation code: <code className="break-all font-mono text-slate-900">{inviteToken}</code>
          </div>
        )}
      </motion.form>

      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Members</h3>
          <p className="text-sm text-slate-500">{members.length} people in this workspace</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading team…</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map(member => (
              <div key={member.id} className="grid gap-4 p-5 lg:grid-cols-[1.4fr_160px_190px_150px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-slate-900">{member.full_name || member.phone}</p>
                    {member.id === user?.id && <Badge variant="outline">You</Badge>}
                    <Badge variant={member.status === 'active' ? 'default' : member.status === 'revoked' ? 'destructive' : 'secondary'} className="capitalize">{member.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{member.phone}</p>
                </div>

                {isOwner ? (
                  <select value={member.role} disabled={busyId === member.id} onChange={event => updateMember(member, { role: event.target.value as TeamRole })} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm capitalize text-slate-700">
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="agent">Agent</option>
                  </select>
                ) : (
                  <Badge variant="outline" className="w-fit capitalize">{member.role}</Badge>
                )}

                <div className="flex items-center gap-2">
                  <Switch checked={member.can_view_contact_phone} disabled={!isOwner || busyId === member.id} onCheckedChange={checked => updateMember(member, { can_view_contact_phone: checked })} />
                  <span className="text-xs text-slate-500">See contact phones</span>
                </div>

                <div className="flex justify-end">
                  {isOwner && member.id !== user?.id && (
                    <Button variant="outline" size="sm" disabled={busyId === member.id} onClick={() => changeStatus(member, member.status === 'revoked' ? 'restore' : 'revoke')} className={member.status === 'revoked' ? 'text-emerald-700' : 'text-red-600'}>
                      {member.status === 'revoked' ? 'Restore' : 'Revoke'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!members.length && <div className="p-8 text-center text-sm text-slate-500">No team members found.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
