import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { dealsApi, dealStagesApi, teamApi, customFieldsApi } from '@/lib/api'
import { formatMaskedCurrency } from '@/lib/currency'
import type { Deal } from '@/types/deal'
import type { MergedDealResult } from '@/types/duplicateMerge'

type Side = 'left' | 'right'

const FIELD_DEFS: Array<{ key: string; label: string }> = [
  { key: 'name', label: 'Deal Name' },
  { key: 'value', label: 'Value' },
  { key: 'currency', label: 'Currency' },
  { key: 'stage_id', label: 'Stage' },
  { key: 'probability', label: 'Probability' },
  { key: 'expected_close_date', label: 'Expected Close Date' },
  { key: 'actual_close_date', label: 'Actual Close Date' },
  { key: 'outcome_reason', label: 'Win/Loss Reason' },
  { key: 'owner_id', label: 'Owner' },
  { key: 'notes', label: 'Notes' },
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

export function MergeDealsModal({
  dealA,
  dealB,
  onClose,
  onMerged,
}: {
  dealA: Deal
  dealB: Deal
  onClose: () => void
  onMerged: (result: MergedDealResult) => void
}) {
  const [older, newer] = useMemo(
    () => [dealA, dealB].sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()),
    [dealA, dealB]
  )
  const { data: freshOlder } = useQuery({ queryKey: ['deal', older.id], queryFn: () => dealsApi.get(older.id) })
  const { data: freshNewer } = useQuery({ queryKey: ['deal', newer.id], queryFn: () => dealsApi.get(newer.id) })
  const left = freshOlder ?? older
  const right = freshNewer ?? newer

  const { data: stagesData } = useQuery({ queryKey: ['deal-stages'], queryFn: dealStagesApi.list })
  const stageNameById = new Map((stagesData?.stages ?? []).map((s) => [s.id, s.name]))
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const memberNameById = new Map((rosterData?.members ?? []).map((m) => [m.id, m.nickname || m.email]))
  const { data: customFieldsData } = useQuery({ queryKey: ['custom-fields'], queryFn: customFieldsApi.list })
  const dealCustomDefs = (customFieldsData?.fields ?? []).filter((f) => f.applies_to === 'deals' || f.applies_to === 'both')

  const [survivorSide, setSurvivorSide] = useState<Side>('left')
  const [picks, setPicks] = useState<Record<string, Side>>(() =>
    Object.fromEntries(FIELD_DEFS.map((f) => [f.key, defaultSide((left as any)[f.key], (right as any)[f.key], left.updated_at, right.updated_at)]))
  )
  const [customPicks, setCustomPicks] = useState<Record<string, Side>>(() =>
    Object.fromEntries(
      dealCustomDefs.map((d) => [
        d.id,
        defaultSide(left.custom_fields?.[d.id], right.custom_fields?.[d.id], left.updated_at, right.updated_at),
      ])
    )
  )

  function renderValue(key: string, deal: Deal): string {
    const value = (deal as any)[key]
    if (key === 'stage_id') return value ? stageNameById.get(value) ?? '—' : '—'
    if (key === 'owner_id') return value ? memberNameById.get(value) ?? '—' : 'Unassigned'
    if (key === 'value') return formatMaskedCurrency(deal.value, deal.currency)
    if (key === 'probability') return isEmpty(value) ? '—' : `${value}%`
    return isEmpty(value) ? '—' : String(value)
  }

  const mergeMutation = useMutation({
    mutationFn: () => {
      const survivor = survivorSide === 'left' ? left : right
      const loser = survivorSide === 'left' ? right : left
      const fields: Record<string, any> = {}
      for (const f of FIELD_DEFS) {
        fields[f.key] = picks[f.key] === 'left' ? (left as any)[f.key] : (right as any)[f.key]
      }
      const customFields: Record<string, any> = {}
      for (const d of dealCustomDefs) {
        customFields[d.id] = (customPicks[d.id] ?? 'left') === 'left' ? left.custom_fields?.[d.id] ?? null : right.custom_fields?.[d.id] ?? null
      }
      return dealsApi.merge({ survivorId: survivor.id, loserId: loser.id, fields, customFields })
    },
    onSuccess: (result) => onMerged(result),
  })

  return (
    <Modal open onClose={onClose} title="Merge Duplicate Deals" size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-base-850 px-3 py-2.5 text-sm">
          <p className="text-base-300">
            Surviving record: <span className="font-medium text-base-100">{survivorSide === 'left' ? left.name : right.name}</span> (id remains unchanged)
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
                className={`grid grid-cols-1 gap-2 rounded-lg p-2.5 sm:grid-cols-[140px_1fr_1fr] sm:items-start ${
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

          {dealCustomDefs.length > 0 && (
            <>
              <p className="mt-3 px-2 text-xs font-semibold uppercase tracking-wide text-base-400">Custom Fields</p>
              {dealCustomDefs.map((d) => {
                const lv = left.custom_fields?.[d.id]
                const rv = right.custom_fields?.[d.id]
                const differs = JSON.stringify(lv ?? null) !== JSON.stringify(rv ?? null)
                return (
                  <div
                    key={d.id}
                    className={`grid grid-cols-1 gap-2 rounded-lg p-2.5 sm:grid-cols-[140px_1fr_1fr] sm:items-start ${
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
        </div>

        {mergeMutation.isError && <p className="text-sm text-danger">{(mergeMutation.error as Error).message}</p>}

        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button className="btn-secondary" onClick={onClose} disabled={mergeMutation.isPending}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => mergeMutation.mutate()} disabled={mergeMutation.isPending}>
            {mergeMutation.isPending ? 'Merging…' : 'Merge Deals'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
