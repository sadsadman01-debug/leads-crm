import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { industriesApi, leadsApi } from '@/lib/api'
import { LEAD_SOURCES, PRIORITIES, type LeadFormInput, type SocialProfile } from '@/types/lead'
import { TagInput } from '@/components/TagInput'
import { SocialProfilesEditor } from '@/components/SocialProfilesEditor'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

const EMPTY_FORM: LeadFormInput = {
  company_name: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  notes: '',
  lead_source: 'Manual Entry',
  priority: 'Medium',
  industry_id: '',
  tags: [],
  social_profiles: [],
}

export function LeadForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<LeadFormInput>(EMPTY_FORM)
  const [initialized, setInitialized] = useState(!isEdit)

  const { data: existingLead } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.get(id!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existingLead && !initialized) {
      setForm({
        company_name: existingLead.company_name,
        address: existingLead.address ?? '',
        phone: existingLead.phone ?? '',
        email: existingLead.email ?? '',
        website: existingLead.website ?? '',
        notes: existingLead.notes ?? '',
        lead_source: existingLead.lead_source,
        priority: existingLead.priority,
        industry_id: existingLead.industry_id ?? '',
        tags: existingLead.tags.map((t) => t.name),
        social_profiles: existingLead.social_profiles,
      })
      setInitialized(true)
    }
  }, [existingLead, initialized])

  const debouncedCompany = useDebouncedValue(form.company_name, 400)
  const debouncedPhone = useDebouncedValue(form.phone, 400)
  const debouncedEmail = useDebouncedValue(form.email, 400)

  const { data: duplicateResult } = useQuery({
    queryKey: ['duplicate-check', debouncedCompany, debouncedPhone, debouncedEmail, id],
    queryFn: () =>
      leadsApi.checkDuplicate({
        company_name: debouncedCompany,
        phone: debouncedPhone,
        email: debouncedEmail,
        excludeId: id,
      }),
    enabled: Boolean(debouncedCompany || debouncedPhone || debouncedEmail),
  })

  const duplicates = duplicateResult?.matches ?? []

  const { data: industriesData } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, address: form.address || null, phone: form.phone || null,
        email: form.email || null, website: form.website || null, notes: form.notes || null,
        industry_id: form.industry_id || null }
      return isEdit ? leadsApi.update(id!, payload as any) : leadsApi.create(payload as any)
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      navigate(`/leads/${lead.id}`)
    },
  })

  function set<K extends keyof LeadFormInput>(key: K, value: LeadFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  if (isEdit && !initialized) {
    return <div className="p-12 text-center text-base-400">Loading lead…</div>
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button className="btn-ghost mb-4 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} />
        Back
      </button>

      <h1 className="mb-6 text-2xl font-semibold text-base-100">
        {isEdit ? 'Edit Lead' : 'Add New Lead'}
      </h1>

      {duplicates.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Possible duplicate{duplicates.length > 1 ? 's' : ''} found</p>
            <ul className="mt-1 space-y-0.5 text-warn/90">
              {duplicates.map((m) => (
                <li key={m.id}>
                  {m.company_name} {m.phone ? `· ${m.phone}` : ''} {m.email ? `· ${m.email}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveMutation.mutate()
        }}
        className="card space-y-6 p-4 sm:p-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Company Name *</label>
            <input
              className="input"
              required
              value={form.company_name}
              onChange={(e) => set('company_name', e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>

          <div>
            <label className="label">Phone Number</label>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>

          <div>
            <label className="label">Email Address</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label">Website</label>
            <input
              className="input"
              placeholder="https://…"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Lead Source</label>
            <select
              className="input"
              value={form.lead_source}
              onChange={(e) => set('lead_source', e.target.value as any)}
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Priority Level</label>
            <select
              className="input"
              value={form.priority}
              onChange={(e) => set('priority', e.target.value as any)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label">Industry</label>
            <select
              className="input"
              value={form.industry_id}
              onChange={(e) => set('industry_id', e.target.value)}
            >
              <option value="">Unassigned</option>
              {(industriesData?.industries ?? []).map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Social Profiles</label>
          <SocialProfilesEditor
            value={form.social_profiles}
            onChange={(v: SocialProfile[]) => set('social_profiles', v)}
          />
        </div>

        <div>
          <label className="label">Tags / Categories</label>
          <TagInput value={form.tags} onChange={(v) => set('tags', v)} />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            className="input min-h-[100px] resize-y"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Any additional context about this lead…"
          />
          {!isEdit && (
            <p className="mt-1.5 text-xs text-base-400">
              File attachments can be added once the lead is created.
            </p>
          )}
        </div>

        {saveMutation.isError && (
          <p className="text-sm text-danger">Something went wrong. Please try again.</p>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Lead'}
          </button>
        </div>
      </form>
    </div>
  )
}
