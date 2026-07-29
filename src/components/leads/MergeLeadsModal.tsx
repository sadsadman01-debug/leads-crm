import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Paperclip, Tag as TagIcon, Link2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { leadsApi, pipelineStagesApi, industriesApi, teamApi, customFieldsApi } from '@/lib/api'
import { STATUS_TOGGLE_FIELDS } from '@/types/lead'
import type { Lead } from '@/types/lead'
import type { MergedLeadResult } from '@/types/duplicateMerge'

type Side = 'left' | 'right'

const FIELD_DEFS: Array<{ key: string; label: string }> = [
  { key: 'company_name', label: 'Company Name' },
  { key: 'contact_name', label: 'Contact Name' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'notes', label: 'Notes' },
  { key: 'lead_source', label: 'Lead Source' },
  { key: 'priority', label: 'Priority' },
  { key: 'stage_id', label: 'Stage' },
  { key: 'industry_id', label: 'Industry' },
  { key: 'assigned_to', label: 'Assigned To' },
]

function isEmpty(v: any): boolean {
  return v === null || v === undefined || v === ''
}

function defaultSide(a: any, b: any, updatedA: string, updatedB: string): Side {
  const aEmpty = isEmpty(a)
  const bEmpty = isEmpty(b)
  if (aEmpty && !bEmpty) return 'right'
  if (bEmpty && !aEmpty) return 'left'
  if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
    return new Date(updatedA).getTime() >= new Date(updatedB).getTime() ? 'left' : 'right'
  }
  return 'left'
}

export function MergeLeadsModal({
  leadA,
  leadB,
  onClose,
  onMerged,
}: {
  leadA: Lead
  leadB: Lead
  onClose: () => void
  onMerged: (result: MergedLeadResult) => void
}) {
  // Oldest first by default — the more established record survives unless the admin swaps.
  const [older, newer] = useMemo(
    () => [leadA, leadB].sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()),
    [leadA, leadB]
  )

  const { data: freshOlder } = useQuery({ queryKey: ['lead', older.id], queryFn: () => leadsApi.get(older.id) })
  const { data: freshNewer } = useQuery({ queryKey: ['lead', newer.id], queryFn: () => leadsApi.get(newer.id) })
  const left = freshOlder ?? older
  const right = freshNewer ?? newer

  const { data: stagesData } = useQuery({ queryKey: ['pipeline-stages'], queryFn: pipelineStagesApi.list })
  const stageNameById = new Map((stagesData?.stages ?? []).map((s) => [s.id, s.name]))
  const { data: industriesData } = useQuery({ queryKey: ['industries'], queryFn: industriesApi.list })
  const industryNameById = new Map((industriesData?.industries ?? []).map((i) => [i.id, i.name]))
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const memberNameById = new Map((rosterData?.members ?? []).map((m) => [m.id, m.nickname || m.email]))
  const { data: customFieldsData } = useQuery({ queryKey: ['custom-fields'], queryFn: customFieldsApi.list })
  const leadCustomDefs = (customFieldsData?.fields ?? []).filter((f) => f.applies_to === 'leads' || f.applies_to === 'both')

  const [survivorSide, setSurvivorSide] = useState<Side>('left')
  const [picks, setPicks] = useState<Record<string, Side>>(() =>
    Object.fromEntries(FIELD_DEFS.map((f) => [f.key, defaultSide((left as any)[f.key], (right as any)[f.key], left.updated_at, right.updated_at)]))
  )
  const [customPicks, setCustomPicks] = useState<Record<string, Side>>(() =>
    Object.fromEntries(
      leadCustomDefs.map((d) => [
        d.id,
        defaultSide(left.custom_fields?.[d.id], right.custom_fields?.[d.id], left.updated_at, right.updated_at),
      ])
    )
  )
  const [statusChecks, setStatusChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(STATUS_TOGGLE_FIELDS.map(({ field }) => [field, Boolean((left.status as any)?.[field]) || Boolean((right.status as any)?.[field])]))
  )

  function renderValue(key: string, lead: Lead): string {
    const value = (lead as any)[key]
    if (key === 'stage_id') return value ? stageNameById.get(value) ?? '—' : '—'
    if (key === 'industry_id') return value ? industryNameById.get(value) ?? '—' : '—'
    if (key === 'assigned_to') return value ? memberNameById.get(value) ?? '—' : 'Unassigned'
    return isEmpty(value) ? '—' : String(value)
  }

  const unionTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const t of [...(left.tags ?? []), ...(right.tags ?? [])]) map.set(t.id, t)
    return [...map.values()]
  }, [left, right])

  const unionSocial = useMemo(() => {
    const map = new Map<string, { platform: string; url: string }>()
    for (const s of [...(left.social_profiles ?? []), ...(right.social_profiles ?? [])]) {
      map.set(`${s.platform.toLowerCase()}|${s.url.toLowerCase()}`, s)
    }
    return [...map.values()]
  }, [left, right])

  const attachmentCount = (left.attachments?.length ?? 0) + (right.attachments?.length ?? 0)

  const mergeMutation = useMutation({
    mutationFn: () => {
      const survivor = survivorSide === 'left' ? left : right
      const loser = survivorSide === 'left' ? right : left
      const fields: Record<string, any> = {}
      for (const f of FIELD_DEFS) {
        fields[f.key] = picks[f.key] === 'left' ? (left as any)[f.key] : (right as any)[f.key]
      }
      const customFields: Record<string, any> = {}
      for (const d of leadCustomDefs) {
        customFields[d.id] = (customPicks[d.id] ?? 'left') === 'left' ? left.custom_fields?.[d.id] ?? null : right.custom_fields?.[d.id] ?? null
      }
      return leadsApi.merge({ survivorId: survivor.id, loserId: loser.id, fields, customFields, statusOverrides: statusChecks })
    },
    onSuccess: (result) => onMerged(result),
  })

  return (
    <Modal open onClose={onClose} title="Merge Duplicate Leads" size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-base-850 px-3 py-2.5 text-sm">
          <p className="text-base-300">
            Surviving record: <span className="font-medium text-base-100">{survivorSide === 'left' ? left.company_name : right.company_name}</span>{' '}
            (id remains unchanged)
          </p>
          <button className="btn-ghost px-2 text-xs" onClick={() => setSurvivorSide((s) => (s === 'left' ? 'right' : 'left'))}>
            <ArrowLeftRight size={13} />
            Swap
          </button>
        </div>

        <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
          {FIELD_DEFS.map((f) => {
            const differs = renderValue(f.key, left) !== renderValue(f.key, right)
            return (
              <div
                key={f.key}
                className={`grid grid-cols-1 gap-2 rounded-lg p-2.5 sm:grid-cols-[120px_1fr_1fr] sm:items-start ${
                  differs ? 'bg-warn-bg' : ''
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-base-400 sm:pt-1.5">{f.label}</p>
                {(['left', 'right'] as Side[]).map((side) => (
                  <label key={side} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-base-800/60">
                    {differs && (
                      <input
                        type="radio"
                        className="mt-1 accent-accent-500"
                        checked={picks[f.key] === side}
                        onChange={() => setPicks((p) => ({ ...p, [f.key]: side }))}
                      />
                    )}
                    <span className="text-sm text-base-200 break-words">{renderValue(f.key, side === 'left' ? left : right)}</span>
                  </label>
                ))}
              </div>
            )
          })}

          {leadCustomDefs.length > 0 && (
            <>
              <p className="mt-3 px-2 text-xs font-semibold uppercase tracking-wide text-base-400">Custom Fields</p>
              {leadCustomDefs.map((d) => {
                const lv = left.custom_fields?.[d.id]
                const rv = right.custom_fields?.[d.id]
                const differs = JSON.stringify(lv ?? null) !== JSON.stringify(rv ?? null)
                return (
                  <div
                    key={d.id}
                    className={`grid grid-cols-1 gap-2 rounded-lg p-2.5 sm:grid-cols-[120px_1fr_1fr] sm:items-start ${
                      differs ? 'bg-warn-bg' : ''
                    }`}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-base-400 sm:pt-1.5">{d.label}</p>
                    {(['left', 'right'] as Side[]).map((side) => (
                      <label key={side} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-base-800/60">
                        {differs && (
                          <input
                            type="radio"
                            className="mt-1 accent-accent-500"
                            checked={(customPicks[d.id] ?? 'left') === side}
                            onChange={() => setCustomPicks((p) => ({ ...p, [d.id]: side }))}
                          />
                        )}
                        <span className="text-sm text-base-200 break-words">
                          {isEmpty(side === 'left' ? lv : rv) ? '—' : String(side === 'left' ? lv : rv)}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </>
          )}

          <p className="mt-3 px-2 text-xs font-semibold uppercase tracking-wide text-base-400">
            Combined automatically (union, not a pick)
          </p>
          <div className="space-y-2 px-2">
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-base-300">
              <TagIcon size={13} className="text-base-500" />
              {unionTags.length > 0 ? unionTags.map((t) => <span key={t.id} className="pill bg-base-800 text-base-300">{t.name}</span>) : 'No tags'}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-base-300">
              <Link2 size={13} className="text-base-500" />
              {unionSocial.length > 0 ? `${unionSocial.length} social profile(s) combined` : 'No social profiles'}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-base-300">
              <Paperclip size={13} className="text-base-500" />
              {attachmentCount > 0 ? `${attachmentCount} attachment(s) combined` : 'No attachments'}
            </div>
          </div>

          <p className="mt-3 px-2 text-xs font-semibold uppercase tracking-wide text-base-400">
            Outreach Status — defaults to true if either lead has it marked
          </p>
          <div className="grid grid-cols-1 gap-1.5 px-2 sm:grid-cols-2">
            {STATUS_TOGGLE_FIELDS.map(({ field, label }) => (
              <label key={field} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-base-200 hover:bg-base-800/60">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-base-600 bg-base-800 text-accent-500 focus:ring-accent-500"
                  checked={Boolean(statusChecks[field])}
                  onChange={(e) => setStatusChecks((s) => ({ ...s, [field]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {mergeMutation.isError && <p className="text-sm text-danger">{(mergeMutation.error as Error).message}</p>}

        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button className="btn-secondary" onClick={onClose} disabled={mergeMutation.isPending}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => mergeMutation.mutate()} disabled={mergeMutation.isPending}>
            {mergeMutation.isPending ? 'Merging…' : 'Merge Leads'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
