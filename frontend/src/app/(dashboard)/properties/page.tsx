'use client'

import Link from 'next/link'
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  Film,
  ImagePlus,
  Loader2,
  MapPin,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { uploadMedia } from '@/lib/media-client'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Property = {
  id: number
  title: string
  description: string | null
  property_type: string | null
  location: string | null
  state: string | null
  price: number | null
  price_max: number | null
  currency: string | null
  size_sqm: number | null
  bedrooms: number | null
  bathrooms: number | null
  title_document: string | null
  payment_plan: string | null
  features: string | null
  image_urls: string | null
  video_url: string | null
  status: string
  created_at: string
}

type FormState = {
  title: string
  description: string
  property_type: string
  location: string
  state: string
  price: string
  price_max: string
  currency: string
  size_sqm: string
  bedrooms: string
  bathrooms: string
  title_document: string
  payment_plan: string
  features: string
  image_urls: string[]
  video_url: string
  status: string
}

type GeneratedDraft = {
  id: number
  kind: string
  caption: string
  hashtags: string | null
  image_urls: string | null
  platforms: string | null
  status: string
}

const emptyForm: FormState = {
  title: '', description: '', property_type: '', location: '', state: '',
  price: '', price_max: '', currency: 'NGN', size_sqm: '', bedrooms: '',
  bathrooms: '', title_document: '', payment_plan: '', features: '',
  image_urls: [], video_url: '', status: 'available',
}

const statusClass: Record<string, string> = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  reserved: 'border-amber-200 bg-amber-50 text-amber-700',
  sold: 'border-slate-200 bg-slate-100 text-slate-600',
  hidden: 'border-red-200 bg-red-50 text-red-700',
}

function images(value: string | null) {
  return (value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined
}

function propertyForm(property: Property): FormState {
  return {
    title: property.title,
    description: property.description || '',
    property_type: property.property_type || '',
    location: property.location || '',
    state: property.state || '',
    price: property.price == null ? '' : String(property.price),
    price_max: property.price_max == null ? '' : String(property.price_max),
    currency: property.currency || 'NGN',
    size_sqm: property.size_sqm == null ? '' : String(property.size_sqm),
    bedrooms: property.bedrooms == null ? '' : String(property.bedrooms),
    bathrooms: property.bathrooms == null ? '' : String(property.bathrooms),
    title_document: property.title_document || '',
    payment_plan: property.payment_plan || '',
    features: property.features || '',
    image_urls: images(property.image_urls),
    video_url: property.video_url || '',
    status: property.status,
  }
}

function formatPrice(property: Property) {
  if (property.price == null) return 'Price not supplied'
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: property.currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(property.price)
}

export default function PropertyVaultPage() {
  const { user } = useAuth()
  const companyId = user?.company_id
  const inputRef = useRef<HTMLInputElement>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generatingId, setGeneratingId] = useState<number | null>(null)
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedDraft | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const response = await api.get(`/companies/${companyId}/properties`)
      setProperties(Array.isArray(response.data) ? response.data : [])
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not load the Property Vault.'))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => ({
    available: properties.filter(item => item.status === 'available').length,
    mediaReady: properties.filter(item => images(item.image_urls).length || item.video_url).length,
    total: properties.length,
  }), [properties])

  const update = (field: keyof FormState, value: string | string[]) => {
    setForm(current => ({ ...current, [field]: value }))
  }

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      const uploaded = []
      for (const file of files) uploaded.push(await uploadMedia(file))
      const newImages = uploaded.filter(item => item.contentType.startsWith('image/')).map(item => item.url)
      const video = uploaded.find(item => item.contentType.startsWith('video/'))
      setForm(current => ({
        ...current,
        image_urls: [...current.image_urls, ...newImages].slice(0, 10),
        video_url: video?.url || current.video_url,
      }))
      setNotice(`${uploaded.length} media file${uploaded.length === 1 ? '' : 's'} uploaded and attached.`)
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not upload the selected media.'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const reset = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (!form.title.trim()) throw new Error('Give the property a title.')
      if (!form.description.trim()) throw new Error('Add a factual property description for the AI.')
      if (!form.image_urls.length && !form.video_url) throw new Error('Upload at least one image or video.')
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        property_type: form.property_type.trim() || undefined,
        location: form.location.trim() || undefined,
        state: form.state.trim() || undefined,
        price: numberOrUndefined(form.price),
        price_max: numberOrUndefined(form.price_max),
        currency: form.currency.trim() || 'NGN',
        size_sqm: numberOrUndefined(form.size_sqm),
        bedrooms: numberOrUndefined(form.bedrooms),
        bathrooms: numberOrUndefined(form.bathrooms),
        title_document: form.title_document.trim() || undefined,
        payment_plan: form.payment_plan.trim() || undefined,
        features: form.features.trim() || undefined,
        image_urls: form.image_urls.join(','),
        video_url: form.video_url || undefined,
        status: form.status,
      }
      if (editingId) {
        await api.put(`/companies/${companyId}/properties/${editingId}`, payload)
        setNotice('Property updated.')
      } else {
        await api.post(`/companies/${companyId}/properties`, payload)
        setNotice('Property added to the Vault.')
      }
      reset()
      await load()
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not save this property.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (property: Property) => {
    if (!window.confirm(`Delete “${property.title}” from the Property Vault?`)) return
    try {
      await api.delete(`/companies/${companyId}/properties/${property.id}`)
      if (editingId === property.id) reset()
      setNotice('Property removed from the Vault.')
      await load()
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not remove this property.'))
    }
  }

  const generate = async (property: Property) => {
    setGeneratingId(property.id)
    setError('')
    try {
      const platforms = images(property.image_urls).length ? 'facebook,instagram' : 'facebook'
      const response = await api.post(`/companies/${companyId}/content/generate`, {
        kind: 'showcase',
        property_id: property.id,
        platforms,
        auto_approve: false,
      })
      const created = response.data as GeneratedDraft
      setGeneratedDraft(created)
      setNotice(`Draft created from “${property.title}”.`)
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not generate a draft from this property.'))
    } finally {
      setGeneratingId(null)
    }
  }

  return (
    <div className="space-y-7">
      <Dialog
        open={generatedDraft !== null}
        onOpenChange={open => {
          if (!open) setGeneratedDraft(null)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0">
          {generatedDraft && (
            <>
              <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-blue-50 px-6 py-5">
                <DialogHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <DialogTitle>Your content draft is ready</DialogTitle>
                  <DialogDescription>
                    Review the generated post now, or continue to Content Approval to edit, schedule, or publish it.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="space-y-5 px-6 pb-6">
                {images(generatedDraft.image_urls)[0] && (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <img
                      src={images(generatedDraft.image_urls)[0]}
                      alt="Generated property post preview"
                      className="max-h-64 w-full object-cover"
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    Draft
                  </Badge>
                  {(generatedDraft.platforms || 'facebook')
                    .split(',')
                    .map(platform => platform.trim())
                    .filter(Boolean)
                    .map(platform => (
                      <Badge key={platform} variant="outline" className="capitalize">
                        {platform}
                      </Badge>
                    ))}
                </div>

                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
                    {generatedDraft.caption}
                  </p>
                  {generatedDraft.hashtags && (
                    <p className="mt-4 text-sm font-medium leading-6 text-emerald-700">
                      {generatedDraft.hashtags}
                    </p>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:space-x-0">
                  <Button type="button" variant="outline" onClick={() => setGeneratedDraft(null)}>
                    Stay in Property Vault
                  </Button>
                  <Link
                    href={`/content?draft=${generatedDraft.id}`}
                    className={buttonVariants()}
                  >
                    Review and approve
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Building2 className="h-5 w-5" /></div>
          <div><h2 className="text-2xl font-bold text-foreground">Property Vault</h2><p className="mt-0.5 text-sm text-muted-foreground">Add properties once. ChatPilot can turn them into approval-ready posts automatically.</p></div>
        </div>
        <Link href="/automation" className={buttonVariants()}><Sparkles className="mr-2 h-4 w-4" />Content automation</Link>
      </div>

      {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        {[[stats.total, 'Total properties'], [stats.available, 'Available'], [stats.mediaReady, 'Media ready']].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p></div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><h3 className="font-semibold text-slate-900">{editingId ? 'Edit property' : 'Add a property'}</h3><p className="mt-1 text-sm text-slate-500">Only enter verified facts. AI will not invent missing prices, titles or locations.</p></div>
          {editingId && <Button type="button" variant="outline" size="sm" onClick={reset}><X className="mr-2 h-4 w-4" />Cancel edit</Button>}
        </div>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="property-title">Property title *</Label><Input id="property-title" value={form.title} onChange={event => update('title', event.target.value)} placeholder="4-bedroom duplex in Lekki" /></div>
            <div className="space-y-2"><Label htmlFor="property-type">Property type</Label><Input id="property-type" value={form.property_type} onChange={event => update('property_type', event.target.value)} placeholder="Duplex, land, apartment…" /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="property-description">Description *</Label><Textarea id="property-description" value={form.description} onChange={event => update('description', event.target.value)} rows={4} placeholder="Describe the property, its strongest selling points and any important caveats." /></div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="location">Location</Label><Input id="location" value={form.location} onChange={event => update('location', event.target.value)} placeholder="Lekki Phase 1" /></div>
            <div className="space-y-2"><Label htmlFor="state">State</Label><Input id="state" value={form.state} onChange={event => update('state', event.target.value)} placeholder="Lagos" /></div>
            <div className="space-y-2"><Label htmlFor="status">Availability</Label><select id="status" value={form.status} onChange={event => update('status', event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option><option value="hidden">Hidden</option></select></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2"><Label htmlFor="price">Price</Label><Input id="price" type="number" min="0" value={form.price} onChange={event => update('price', event.target.value)} placeholder="15000000" /></div>
            <div className="space-y-2"><Label htmlFor="currency">Currency</Label><Input id="currency" value={form.currency} onChange={event => update('currency', event.target.value.toUpperCase())} /></div>
            <div className="space-y-2"><Label htmlFor="bedrooms">Bedrooms</Label><Input id="bedrooms" type="number" min="0" value={form.bedrooms} onChange={event => update('bedrooms', event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="bathrooms">Bathrooms</Label><Input id="bathrooms" type="number" min="0" value={form.bathrooms} onChange={event => update('bathrooms', event.target.value)} /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="title-document">Title document</Label><Input id="title-document" value={form.title_document} onChange={event => update('title_document', event.target.value)} placeholder="C of O, Governor’s Consent…" /></div>
            <div className="space-y-2"><Label htmlFor="payment-plan">Payment plan</Label><Input id="payment-plan" value={form.payment_plan} onChange={event => update('payment_plan', event.target.value)} placeholder="30% deposit, balance over 6 months" /></div>
            <div className="space-y-2"><Label htmlFor="size">Size (sqm)</Label><Input id="size" type="number" min="0" value={form.size_sqm} onChange={event => update('size_sqm', event.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="features">Features and amenities</Label><Textarea id="features" value={form.features} onChange={event => update('features', event.target.value)} rows={2} placeholder="Swimming pool, fitted kitchen, parking, security…" /></div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><Label>Property media *</Label><p className="mt-1 text-xs text-slate-400">Up to 10 images and one short MP4/MOV tour. Images are used for automatic Instagram feed posts.</p></div><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={upload} className="sr-only" /><Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}{uploading ? 'Uploading…' : 'Upload media'}</Button></div>
            {!!form.image_urls.length && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{form.image_urls.map((url, index) => <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={url} alt={`Property image ${index + 1}`} className="h-full w-full object-cover" /><button type="button" onClick={() => update('image_urls', form.image_urls.filter(item => item !== url))} className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-red-600 shadow"><X className="h-3.5 w-3.5" /></button>{index === 0 && <span className="absolute bottom-1.5 left-1.5 rounded bg-slate-900/75 px-2 py-0.5 text-[10px] font-medium text-white">Cover</span>}</div>)}</div>}
            {form.video_url && <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700"><span className="inline-flex min-w-0 items-center gap-2"><Film className="h-4 w-4 shrink-0" /><span className="truncate">Video tour attached</span></span><button type="button" onClick={() => update('video_url', '')}><X className="h-4 w-4" /></button></div>}
            {!form.image_urls.length && !form.video_url && <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500"><ImagePlus className="h-6 w-6 text-emerald-600" /><span className="mt-2 text-sm font-medium">Add photos or a video tour</span></button>}
          </div>

          <div className="flex justify-end"><Button type="submit" disabled={saving || uploading}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Check className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{editingId ? 'Save changes' : 'Add to Property Vault'}</Button></div>
        </form>
      </section>

      <section className="space-y-4">
        <div><h3 className="font-semibold text-slate-900">Properties</h3><p className="mt-1 text-sm text-slate-500">Available properties with images are eligible for automatic Instagram drafts.</p></div>
        {loading ? <div className="flex min-h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div> : properties.length ? <div className="grid gap-5 lg:grid-cols-2">{properties.map(property => {
          const propertyImages = images(property.image_urls)
          return <article key={property.id} className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
            <div className="grid sm:grid-cols-[180px_1fr]">
              <div className="aspect-[4/3] bg-slate-100 sm:aspect-auto sm:min-h-52">{propertyImages[0] ? <img src={propertyImages[0]} alt={property.title} className="h-full w-full object-cover" /> : <div className="flex h-full min-h-40 items-center justify-center"><Building2 className="h-8 w-8 text-slate-300" /></div>}</div>
              <div className="flex min-w-0 flex-col p-5">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={statusClass[property.status] || statusClass.hidden}>{property.status}</Badge>{property.video_url && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700"><Film className="mr-1 h-3 w-3" />Video</Badge>}</div><h4 className="mt-3 truncate font-semibold text-slate-900">{property.title}</h4></div><div className="flex gap-1"><button type="button" onClick={() => { setEditingId(property.id); setForm(propertyForm(property)); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><PencilLine className="h-4 w-4" /></button><button type="button" onClick={() => remove(property)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div></div>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">{property.description || 'No description supplied.'}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">{property.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{property.location}</span>}{property.bedrooms != null && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{property.bedrooms} beds</span>}<span>{formatPrice(property)}</span><span>{propertyImages.length} image{propertyImages.length === 1 ? '' : 's'}</span></div>
                <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5"><Button size="sm" variant="outline" onClick={() => generate(property)} disabled={generatingId !== null}>{generatingId === property.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Create draft</Button><Link href="/content" className={buttonVariants({ size: 'sm' })}>Review content</Link></div>
              </div>
            </div>
          </article>
        })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Building2 className="mx-auto h-8 w-8 text-slate-300" /><h4 className="mt-4 font-semibold text-slate-800">Your Property Vault is empty</h4><p className="mt-1 text-sm text-slate-500">Add the first property above. ChatPilot will use only the facts you provide.</p></div>}
      </section>
    </div>
  )
}
