'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Ban,
  CalendarClock,
  ChevronDown,
  Clock3,
  ExternalLink,
  Facebook,
  Instagram,
  ImageIcon,
  Loader2,
  MessageCircle,
  PencilLine,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ContentPost = {
  id: number
  kind: string
  topic: string | null
  caption: string
  hashtags: string | null
  image_urls: string | null
  platforms: string | null
  status: string
  scheduled_at: string | null
  published_at: string | null
  fb_post_id: string | null
  ig_post_id: string | null
  error: string | null
  comments_count: number
  wa_clicks: number
  created_at: string
}

type SocialAccount = {
  id: number
  platform: string
  is_active: boolean
  subscribed_at: string | null
}

const CONTENT_KINDS = [
  { value: 'educational', label: 'Educational post' },
  { value: 'tip', label: 'Quick buyer tip' },
  { value: 'faq', label: 'Frequently asked question' },
  { value: 'myth_buster', label: 'Myth buster' },
  { value: 'process', label: 'Buying process' },
  { value: 'area_guide', label: 'Area guide' },
  { value: 'showcase', label: 'Property showcase' },
]

const statusStyle: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-100 text-slate-700',
  approved: 'border-blue-200 bg-blue-50 text-blue-700',
  scheduled: 'border-violet-200 bg-violet-50 text-violet-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  rejected: 'border-slate-200 bg-slate-50 text-slate-500',
}

function localDateTime(value: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function splitPlatforms(value: string | null) {
  const parts = (value || 'facebook').split(',').map(item => item.trim())
  return { facebook: parts.includes('facebook'), instagram: parts.includes('instagram') }
}

function PlatformButton({
  platform,
  selected,
  onClick,
}: {
  platform: 'facebook' | 'instagram'
  selected: boolean
  onClick: () => void
}) {
  const Icon = platform === 'facebook' ? Facebook : Instagram
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
        selected
          ? platform === 'facebook'
            ? 'border-blue-300 bg-blue-50 text-blue-700'
            : 'border-pink-300 bg-pink-50 text-pink-700'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-4 w-4" />
      {platform === 'facebook' ? 'Facebook' : 'Instagram'}
      {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
    </button>
  )
}

function ContentCard({
  post,
  companyId,
  onChanged,
}: {
  post: ContentPost
  companyId: number
  onChanged: (message?: string) => Promise<void>
}) {
  const initialPlatforms = splitPlatforms(post.platforms)
  const [caption, setCaption] = useState(post.caption)
  const [hashtags, setHashtags] = useState(post.hashtags || '')
  const [imageUrl, setImageUrl] = useState(post.image_urls || '')
  const [facebook, setFacebook] = useState(initialPlatforms.facebook)
  const [instagram, setInstagram] = useState(initialPlatforms.instagram)
  const [scheduledAt, setScheduledAt] = useState(localDateTime(post.scheduled_at))
  const [expanded, setExpanded] = useState(post.status !== 'published')
  const [busy, setBusy] = useState<'save' | 'publish' | 'delete' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const payload = () => ({
    caption: caption.trim(),
    hashtags: hashtags.trim(),
    image_urls: imageUrl.trim(),
    platforms: [facebook && 'facebook', instagram && 'instagram'].filter(Boolean).join(','),
    ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
  })

  const validate = () => {
    if (!caption.trim()) throw new Error('The caption cannot be empty.')
    if (!facebook && !instagram) throw new Error('Select at least one platform.')
    if (instagram && !imageUrl.trim()) throw new Error('Instagram requires a public HTTPS image URL.')
    if (imageUrl.trim() && !imageUrl.trim().startsWith('https://')) {
      throw new Error('The image must use a public HTTPS URL that Meta can access.')
    }
  }

  const save = async () => {
    validate()
    await api.put(`/companies/${companyId}/content/${post.id}`, payload())
  }

  const handleSave = async () => {
    setBusy('save')
    setError('')
    setNotice('')
    try {
      await save()
      setNotice('Draft saved.')
      await onChanged()
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not save this draft.'))
    } finally {
      setBusy(null)
    }
  }

  const handlePublish = async () => {
    if (!window.confirm('Publish this post to the selected connected accounts now?')) return
    setBusy('publish')
    setError('')
    setNotice('')
    try {
      await save()
      const response = await api.post(`/companies/${companyId}/content/${post.id}/publish`)
      const action = response.data?.action
      if (action !== 'published' && action !== 'already_published') {
        throw new Error(`Publishing did not complete: ${String(action || 'unknown result').replaceAll('_', ' ')}`)
      }
      setNotice(action === 'already_published' ? 'This post was already published.' : 'Post published successfully.')
      await onChanged('Post published. You can now add a test comment on Facebook or Instagram.')
      setExpanded(false)
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not publish this post. Check the connected account and try again.'))
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  const handleApprove = async () => {
    setBusy('save')
    setError('')
    setNotice('')
    try {
      validate()
      if (!scheduledAt) throw new Error('Choose when this post should publish.')
      await api.put(`/companies/${companyId}/content/${post.id}`, {
        ...payload(),
        status: 'scheduled',
        scheduled_at: new Date(scheduledAt).toISOString(),
      })
      setNotice('Post approved and scheduled.')
      await onChanged('Post approved. It will publish automatically at the scheduled time.')
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not approve this post.'))
    } finally {
      setBusy(null)
    }
  }

  const handleReject = async () => {
    if (!window.confirm('Reject this draft? It will remain in the history but cannot publish.')) return
    setBusy('save')
    setError('')
    try {
      await api.put(`/companies/${companyId}/content/${post.id}`, { status: 'rejected' })
      setNotice('Draft rejected.')
      await onChanged()
      setExpanded(false)
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not reject this draft.'))
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this content item? This does not remove an already published Meta post.')) return
    setBusy('delete')
    setError('')
    try {
      await api.delete(`/companies/${companyId}/content/${post.id}`)
      await onChanged('Content item deleted.')
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not delete this content item.'))
    } finally {
      setBusy(null)
    }
  }

  const created = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(post.published_at || post.created_at))

  return (
    <motion.article layout className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusStyle[post.status] || statusStyle.draft}>
              {post.status.replaceAll('_', ' ')}
            </Badge>
            <span className="text-xs font-medium capitalize text-slate-500">{post.kind.replaceAll('_', ' ')}</span>
            {post.fb_post_id && <Facebook className="h-3.5 w-3.5 text-blue-600" />}
            {post.ig_post_id && <Instagram className="h-3.5 w-3.5 text-pink-600" />}
          </div>
          <p className="mt-2 text-xs text-slate-400">{created}</p>
        </div>
        <div className="flex items-center gap-2">
          {post.status === 'published' && (
            <div className="mr-2 flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{post.comments_count}</span>
              <span className="inline-flex items-center gap-1">WA {post.wa_clicks}</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setExpanded(value => !value)}>
            {expanded ? 'Collapse' : post.status === 'published' ? 'View' : 'Edit'}
            <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor={`caption-${post.id}`}>Caption</Label>
            <Textarea id={`caption-${post.id}`} value={caption} onChange={event => setCaption(event.target.value)} rows={8} />
          </div>
          {post.status !== 'published' && post.status !== 'rejected' && (
            <div className="space-y-2">
              <Label htmlFor={`schedule-${post.id}`}>Scheduled publishing time</Label>
              <Input id={`schedule-${post.id}`} type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} />
              <p className="text-[11px] leading-relaxed text-slate-400">Approval does not publish immediately. The scheduler publishes at this time.</p>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`hashtags-${post.id}`}>Hashtags</Label>
              <Input id={`hashtags-${post.id}`} value={hashtags} onChange={event => setHashtags(event.target.value)} placeholder="#LagosRealEstate #PropertyTips" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`image-${post.id}`}>Public image URL</Label>
                <Link href="/media" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                  <ImageIcon className="h-3.5 w-3.5" /> Media Library
                </Link>
              </div>
              <Input id={`image-${post.id}`} value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://example.com/property.jpg" />
              <p className="text-[11px] leading-relaxed text-slate-400">Required for Instagram. Upload in Media Library if you do not already have a public HTTPS URL.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Publish to</Label>
            <div className="flex flex-wrap gap-2">
              <PlatformButton platform="facebook" selected={facebook} onClick={() => setFacebook(value => !value)} />
              <PlatformButton platform="instagram" selected={instagram} onClick={() => setInstagram(value => !value)} />
            </div>
          </div>

          {(error || notice || post.error) && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${error || post.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {error || notice || post.error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={busy !== null} className="text-red-600 hover:text-red-700">
              {busy === 'delete' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete
            </Button>
            <div className="flex flex-wrap gap-2">
              {post.status !== 'published' && post.status !== 'rejected' && (
                <Button variant="outline" onClick={handleSave} disabled={busy !== null}>
                  {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PencilLine className="mr-2 h-4 w-4" />}
                  Save draft
                </Button>
              )}
              {post.status === 'draft' && (
                <Button variant="outline" onClick={handleReject} disabled={busy !== null} className="text-slate-600">
                  <Ban className="mr-2 h-4 w-4" />Reject
                </Button>
              )}
              {post.status !== 'published' && post.status !== 'rejected' && (
                <Button variant="outline" onClick={handleApprove} disabled={busy !== null}>
                  <CalendarClock className="mr-2 h-4 w-4" />Approve & schedule
                </Button>
              )}
              {post.status !== 'published' && post.status !== 'rejected' && (
                <Button onClick={handlePublish} disabled={busy !== null}>
                  {busy === 'publish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Publish now
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{post.caption}</p>
        </div>
      )}
    </motion.article>
  )
}

export default function ContentPage() {
  const { user } = useAuth()
  const companyId = user?.company_id
  const [posts, setPosts] = useState<ContentPost[]>([])
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [kind, setKind] = useState('educational')
  const [topic, setTopic] = useState('What buyers should check before paying for a property')
  const [imageUrl, setImageUrl] = useState('')
  const [facebook, setFacebook] = useState(true)
  const [instagram, setInstagram] = useState(false)
  const [error, setError] = useState('')
  const [generationError, setGenerationError] = useState('')
  const [notice, setNotice] = useState('')
  const [platformDefaultsApplied, setPlatformDefaultsApplied] = useState(false)

  const loadData = useCallback(async (quiet = false) => {
    if (!companyId) return
    if (!quiet) setRefreshing(true)
    try {
      const [contentResponse, accountsResponse] = await Promise.all([
        api.get(`/companies/${companyId}/content`),
        api.get(`/social/companies/${companyId}/accounts`),
      ])
      setPosts(Array.isArray(contentResponse.data) ? contentResponse.data : [])
      setAccounts(Array.isArray(accountsResponse.data) ? accountsResponse.data : [])
    } catch (cause) {
      if (!quiet) setError(getErrorMessage(cause, 'Could not load content and social status.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    const selectedImage = new URLSearchParams(window.location.search).get('image')
    if (selectedImage?.startsWith('https://')) {
      setImageUrl(selectedImage)
      setNotice('Image selected from Media Library. Choose Instagram and generate your draft.')
    }
  }, [])
  useEffect(() => {
    const interval = window.setInterval(() => loadData(true), 10000)
    return () => window.clearInterval(interval)
  }, [loadData])

  const accountState = useMemo(() => ({
    facebook: accounts.some(account => account.platform === 'facebook' && account.is_active && account.subscribed_at),
    instagram: accounts.some(account => account.platform === 'instagram' && account.is_active && account.subscribed_at),
  }), [accounts])

  useEffect(() => {
    if (platformDefaultsApplied || accounts.length === 0) return
    const activeFacebook = accounts.some(account => account.platform === 'facebook' && account.is_active)
    const activeInstagram = accounts.some(account => account.platform === 'instagram' && account.is_active)
    if (activeInstagram && !activeFacebook) {
      setFacebook(false)
      setInstagram(true)
    }
    setPlatformDefaultsApplied(true)
  }, [accounts, platformDefaultsApplied])

  const stats = useMemo(() => ({
    drafts: posts.filter(post => post.status !== 'published').length,
    published: posts.filter(post => post.status === 'published').length,
    comments: posts.reduce((total, post) => total + (post.comments_count || 0), 0),
  }), [posts])

  const changed = async (message?: string) => {
    if (message) setNotice(message)
    await loadData(true)
  }

  const generate = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setGenerationError('')
    setNotice('')
    try {
      if (!facebook && !instagram) throw new Error('Select at least one platform.')
      if (instagram && !imageUrl.trim()) throw new Error('Instagram requires a public HTTPS image URL.')
      if (imageUrl.trim() && !imageUrl.trim().startsWith('https://')) throw new Error('Use a public HTTPS image URL.')

      setGenerating(true)
      const response = await api.post(`/companies/${companyId}/content/generate`, {
        kind,
        topic: topic.trim() || undefined,
        platforms: [facebook && 'facebook', instagram && 'instagram'].filter(Boolean).join(','),
        auto_approve: false,
      })
      const created = response.data as ContentPost
      if (imageUrl.trim()) {
        await api.put(`/companies/${companyId}/content/${created.id}`, { image_urls: imageUrl.trim() })
      }
      setNotice('Draft generated. Review it below, then select Publish now.')
      await loadData(true)
    } catch (cause) {
      setGenerationError(getErrorMessage(
        cause,
        'The AI service could not generate a draft. The server administrator should confirm GEMINI_API_KEY is valid in Hostinger and restart the chatpilot container.',
      ))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Sparkles className="h-5 w-5" /></div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Content & Live Test</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Generate, publish, and test the comment-to-WhatsApp bot in real time.</p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => loadData()} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {(error || notice) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Drafts & pending', value: stats.drafts, icon: PencilLine, color: 'bg-amber-50 text-amber-700' },
          { label: 'Published', value: stats.published, icon: Send, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Tracked comments', value: stats.comments, icon: MessageCircle, color: 'bg-blue-50 text-blue-700' },
        ].map(item => (
          <div key={item.label} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.color}`}><item.icon className="h-4 w-4" /></div>
            <p className="mt-4 text-2xl font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50 via-white to-blue-50 p-5 shadow-sm lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h3 className="font-semibold text-slate-900">Let the Property Vault drive your content</h3><p className="mt-1 text-sm text-slate-600">Upload verified property facts once, then let automation prepare approval-ready drafts on schedule.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/properties" className={buttonVariants({ variant: 'outline' })}><ImageIcon className="mr-2 h-4 w-4" />Property Vault</Link><Link href="/automation" className={buttonVariants()}><CalendarClock className="mr-2 h-4 w-4" />Automation settings</Link></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900">Connection readiness</h3>
            <p className="mt-1 text-sm text-slate-500">Only active, webhook-subscribed accounts are marked ready.</p>
          </div>
          <Link href="/settings/social" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800">
            Manage connections <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { name: 'Facebook Page', ready: accountState.facebook, icon: Facebook, readyText: 'Ready for publishing and comments' },
            { name: 'Instagram Professional', ready: accountState.instagram, icon: Instagram, readyText: 'Ready for publishing and comments' },
          ].map(item => (
            <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-slate-600" />
                <div><p className="text-sm font-semibold text-slate-800">{item.name}</p><p className="mt-0.5 text-xs text-slate-500">{item.ready ? item.readyText : 'Connection or webhook needs attention'}</p></div>
              </div>
              <span className={`h-2.5 w-2.5 rounded-full ${item.ready ? 'animate-pulse bg-emerald-500' : 'bg-amber-400'}`} />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:p-6">
          <div className="mb-5">
            <h3 className="font-semibold text-slate-900">Create a post</h3>
            <p className="mt-1 text-sm text-slate-500">AI creates a draft first. Nothing is published until you approve it.</p>
          </div>
          <form onSubmit={generate} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="kind">Post type</Label>
                <select id="kind" value={kind} onChange={event => setKind(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {CONTENT_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Platforms</Label>
                <div className="flex gap-2">
                  <PlatformButton platform="facebook" selected={facebook} onClick={() => setFacebook(value => !value)} />
                  <PlatformButton platform="instagram" selected={instagram} onClick={() => setInstagram(value => !value)} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Topic or angle</Label>
              <Textarea id="topic" value={topic} onChange={event => setTopic(event.target.value)} rows={3} placeholder="Example: Three documents every land buyer should verify before paying" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="new-image">Public image URL {instagram ? '(required)' : '(optional)'}</Label>
                <Link href="/media" className={buttonVariants({ variant: 'outline', size: 'sm' })}><ImageIcon className="mr-2 h-4 w-4" />Upload or choose image</Link>
              </div>
              <Input id="new-image" value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://example.com/property.jpg" />
              <p className="text-xs text-slate-400">No public link yet? Go to Media Library, upload the image, then click “Use in content.” Instagram cannot publish a text-only post.</p>
            </div>
            <div className="space-y-3">
              <Button type="submit" disabled={generating || !companyId}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {generating ? 'Generating draft…' : 'Generate draft'}
              </Button>
              {generationError && (
                <div aria-live="assertive" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
                  <strong>Draft was not created.</strong> {generationError}
                </div>
              )}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-emerald-50 shadow-sm">
          <div className="border-b border-blue-100/80 p-5 lg:p-6">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><Clock3 className="h-5 w-5" /></div><div><h3 className="font-semibold text-slate-900">Live comment test</h3><p className="mt-0.5 text-xs text-slate-500">Run this after Publish now succeeds.</p></div></div>
          </div>
          <div className="space-y-4 p-5 lg:p-6">
            {[
              ['1', 'Open the new post on Facebook or Instagram.'],
              ['2', 'From a different accepted app tester account, comment: “How much is this property and is it still available?”'],
              ['3', 'Wait up to 60 seconds. The bot should reply publicly with your WhatsApp link.'],
              ['4', 'Open the WhatsApp link and send a message; confirm the lead appears in Leads or Contacts.'],
            ].map(([number, text]) => (
              <div key={number} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{number}</span><p className="pt-1 text-sm leading-relaxed text-slate-700">{text}</p></div>
            ))}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
              <strong>Meta testing:</strong> if the Meta app is unpublished, the commenting account must be an accepted app tester. Published apps can receive eligible public activity after the required permissions are approved.
            </div>
            <p className="text-xs leading-relaxed text-slate-500">This page refreshes post status and tracked comment totals every 10 seconds. For raw webhook diagnostics, use the backend container logs.</p>
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div><h3 className="font-semibold text-slate-900">Drafts and published posts</h3><p className="mt-1 text-sm text-slate-500">Edit a draft, choose its platforms, and publish when ready.</p></div>
          <span className="text-xs text-slate-400">Auto-refresh: 10 seconds</span>
        </div>
        {loading ? (
          <div className="flex min-h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : posts.length ? (
          <div className="space-y-4">{posts.map(post => <ContentCard key={post.id} post={post} companyId={companyId!} onChanged={changed} />)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Sparkles className="mx-auto h-8 w-8 text-slate-300" /><h4 className="mt-4 font-semibold text-slate-800">No content yet</h4><p className="mt-1 text-sm text-slate-500">Generate your first draft above.</p></div>
        )}
      </section>
    </div>
  )
}
