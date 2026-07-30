import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Search, MapPin, CheckCircle2, AlertTriangle, Loader2, Sparkles, ShieldAlert } from 'lucide-react'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'
import { leadGenerationApi, teamApi } from '@/lib/api'
import { LEAD_GEN_CATEGORIES } from '@/types/leadGeneration'
import type { LeadGenCandidate, LeadGenSearchResult } from '@/types/leadGeneration'
import type { SocialProfile, Priority } from '@/types/lead'
import { PRIORITIES } from '@/types/lead'
import { Badge } from '@/components/ui/Badge'
import { TagInput } from '@/components/TagInput'
import { SocialProfilesEditor } from '@/components/SocialProfilesEditor'

interface EditableFields {
  contact_name: string
  social_profiles: SocialProfile[]
}

function AutoFilledField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-base-400">
        <CheckCircle2 size={12} className="shrink-0 text-success" />
        {label}
      </p>
      <p className="truncate rounded-lg bg-success-bg px-3 py-2 text-sm text-base-100" title={value}>
        {value}
      </p>
    </div>
  )
}

const DUPLICATE_REASON_LABEL: Record<string, string> = {
  phone: 'phone number',
  email: 'email address',
  company_name: 'company name',
}

export function LeadGenerationPage() {
  const { profile } = useAuth()
  const canAccess = Boolean(profile) && (isAdminOrAbove(profile?.role) || profile?.permissions?.canGenerateLeads)

  const [location, setLocation] = useState('')
  const [category, setCategory] = useState(LEAD_GEN_CATEGORIES[0])
  const [result, setResult] = useState<LeadGenSearchResult | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editableById, setEditableById] = useState<Record<string, EditableFields>>({})
  const [importedCount, setImportedCount] = useState<number | null>(null)

  const [bulkTags, setBulkTags] = useState<string[]>([])
  const [bulkPriority, setBulkPriority] = useState<Priority>('Medium')
  const [bulkAssignedTo, setBulkAssignedTo] = useState('')

  const canReassign = isAdminOrAbove(profile?.role)
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster, enabled: canReassign })
  const roster = rosterData?.members ?? []

  const searchMutation = useMutation({
    mutationFn: () => leadGenerationApi.search({ location: location.trim(), category }),
    onSuccess: (data) => {
      setResult(data)
      setImportedCount(null)
      setSelectedIds(new Set(data.candidates.filter((c) => !c.isDuplicate).map((c) => c.id)))
      const initial: Record<string, EditableFields> = {}
      data.candidates.forEach((c) => {
        initial[c.id] = { contact_name: '', social_profiles: [] }
      })
      setEditableById(initial)
    },
  })

  const importMutation = useMutation({
    mutationFn: () => {
      const candidates = (result?.candidates ?? [])
        .filter((c) => selectedIds.has(c.id))
        .map((c) => ({
          id: c.id,
          company_name: c.company_name,
          address: c.address,
          phone: c.phone,
          website: c.website,
          email: c.email,
          contact_name: editableById[c.id]?.contact_name ?? '',
          social_profiles: editableById[c.id]?.social_profiles ?? [],
        }))
      return leadGenerationApi.import({
        candidates,
        bulk: { tags: bulkTags, priority: bulkPriority, assigned_to: bulkAssignedTo },
      })
    },
    onSuccess: (data) => {
      setImportedCount(data.imported)
      setResult(null)
      setSelectedIds(new Set())
      setEditableById({})
      setBulkTags([])
      setBulkPriority('Medium')
      setBulkAssignedTo('')
    },
  })

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updateEditable(id: string, patch: Partial<EditableFields>) {
    setEditableById((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function handleSearch() {
    if (!location.trim()) return
    setImportedCount(null)
    searchMutation.mutate()
  }

  if (!canAccess) {
    return (
      <div className="card flex flex-col items-center gap-3 p-16 text-center">
        <ShieldAlert size={32} className="text-base-500" />
        <p className="text-base-300">You don't have permission to access Lead Generation. Contact your admin.</p>
      </div>
    )
  }

  const candidates = result?.candidates ?? []
  const selectedCount = selectedIds.size

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Lead Generation</h1>
        <p className="mt-1 text-sm text-base-400">
          Search OpenStreetMap for businesses in a location and category, automatically discover their contact email
          from their own website, and import the complete ones straight into your pipeline.
        </p>
      </div>

      <div className="card space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Location</label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-500" />
              <input
                className="input pl-9"
                placeholder="e.g. Austin, TX"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>
          <div>
            <label className="label">Business Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {LEAD_GEN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-base-850 px-3 py-2.5 text-xs text-base-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          Only businesses with a complete Name, Phone, Website, and Email will be shown — this naturally excludes
          many results, especially businesses without a discoverable email.
        </div>

        {searchMutation.isError && (
          <p className="text-sm text-danger">{(searchMutation.error as Error).message}</p>
        )}

        <button className="btn-primary" disabled={!location.trim() || searchMutation.isPending} onClick={handleSearch}>
          {searchMutation.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Searching &amp; checking websites for emails… this can take a minute.
            </>
          ) : (
            <>
              <Search size={16} /> Search
            </>
          )}
        </button>
      </div>

      {importedCount !== null && (
        <div className="flex items-center gap-2 rounded-lg bg-success-bg px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} className="shrink-0" />
          Imported {importedCount} lead{importedCount === 1 ? '' : 's'} successfully.
        </div>
      )}

      {result && (
        <>
          <div className="card space-y-2 p-6">
            <p className="text-sm text-base-200">
              Found <strong>{result.totalFound}</strong> total listings — <strong>{candidates.length}</strong> had
              complete required info and are shown below ({result.excludedForMissingInfo} excluded for missing
              Name/Phone/Website/Email).
            </p>
            {result.duplicatesMergedInBatch > 0 && (
              <p className="text-sm text-base-400">
                {result.duplicatesMergedInBatch} duplicate listing{result.duplicatesMergedInBatch === 1 ? '' : 's'} were
                automatically merged during this search.
              </p>
            )}
          </div>

          {candidates.length > 0 && (
            <>
              <div className="card space-y-4 p-6">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-300">
                  <Sparkles size={15} /> Apply to All Selected on Import
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="label">Tags / Categories</label>
                    <TagInput value={bulkTags} onChange={setBulkTags} />
                  </div>
                  <div>
                    <label className="label">Priority Level</label>
                    <select className="input" value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value as Priority)}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  {canReassign && (
                    <div>
                      <label className="label">Assigned To</label>
                      <select className="input" value={bulkAssignedTo} onChange={(e) => setBulkAssignedTo(e.target.value)}>
                        <option value="">Me ({profile?.nickname || profile?.email})</option>
                        {roster.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nickname || m.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {candidates.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    selected={selectedIds.has(c.id)}
                    editable={editableById[c.id] ?? { contact_name: '', social_profiles: [] }}
                    onToggle={() => toggleSelected(c.id)}
                    onChangeEditable={(patch) => updateEditable(c.id, patch)}
                  />
                ))}
              </div>

              <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-base-700/60 bg-base-900 p-4 shadow-lg">
                <p className="text-sm text-base-300">
                  {selectedCount} of {candidates.length} selected
                </p>
                {importMutation.isError && <p className="text-sm text-danger">{(importMutation.error as Error).message}</p>}
                <button className="btn-primary" disabled={selectedCount === 0 || importMutation.isPending} onClick={() => importMutation.mutate()}>
                  {importMutation.isPending ? 'Importing…' : `Import Selected (${selectedCount})`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function CandidateCard({
  candidate,
  selected,
  editable,
  onToggle,
  onChangeEditable,
}: {
  candidate: LeadGenCandidate
  selected: boolean
  editable: EditableFields
  onToggle: () => void
  onChangeEditable: (patch: Partial<EditableFields>) => void
}) {
  return (
    <div className={`card space-y-4 p-4 sm:p-5 ${candidate.isDuplicate ? 'border border-warn/40' : ''}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-base-100">{candidate.company_name}</p>
          {candidate.address && <p className="text-xs text-base-500">{candidate.address}</p>}
          {candidate.isDuplicate && (
            <div className="mt-1.5">
              <Badge tone={candidate.duplicateStrong ? 'danger' : 'warn'}>
                Possible duplicate — matches existing lead "{candidate.duplicateOf}" by {DUPLICATE_REASON_LABEL[candidate.duplicateReason ?? ''] ?? 'name'}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AutoFilledField label="Phone" value={candidate.phone} />
        <AutoFilledField label="Website" value={candidate.website} />
        <AutoFilledField label="Email" value={candidate.email} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Contact Name</label>
          <input
            className="input border-dashed"
            placeholder="Add contact name (optional)"
            value={editable.contact_name}
            onChange={(e) => onChangeEditable({ contact_name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Social Profiles</label>
          <SocialProfilesEditor value={editable.social_profiles} onChange={(v) => onChangeEditable({ social_profiles: v })} />
        </div>
      </div>
    </div>
  )
}
