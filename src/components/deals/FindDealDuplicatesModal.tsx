import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, GitMerge, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { dealsApi } from '@/lib/api'
import { formatMaskedCurrency } from '@/lib/currency'
import { MergeDealsModal } from './MergeDealsModal'
import { MergeUndoToast } from '@/components/MergeUndoToast'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'
import type { Deal } from '@/types/deal'
import type { DealDuplicateGroup, MergedDealResult } from '@/types/duplicateMerge'

function DealRow({ deal }: { deal: Deal }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-base-850 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-base-100">{deal.name}</p>
        <p className="mt-0.5 text-xs text-base-400">
          {deal.lead?.company_name ?? 'No linked lead'} · Added {new Date(deal.created_at).toLocaleDateString()}
        </p>
      </div>
      <p className="shrink-0 text-sm text-base-200">{formatMaskedCurrency(deal.value, deal.currency)}</p>
    </div>
  )
}

export function FindDealDuplicatesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const canMerge = isAdminOrAbove(profile?.role)
  const { data, isLoading } = useQuery({ queryKey: ['deal-duplicates'], queryFn: dealsApi.findDuplicates })
  const groups = data?.groups ?? []

  const [mergingPair, setMergingPair] = useState<{ a: Deal; b: Deal } | null>(null)
  const [undoState, setUndoState] = useState<{ snapshotId: string; label: string } | null>(null)

  const dismissMutation = useMutation({
    mutationFn: ({ a, b }: { a: string; b: string }) => dealsApi.dismissDuplicate(a, b),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal-duplicates'] }),
  })

  function handleMerged(result: MergedDealResult) {
    setMergingPair(null)
    setUndoState({ snapshotId: result.mergeSnapshotId, label: result.name })
    queryClient.invalidateQueries({ queryKey: ['deal-duplicates'] })
    queryClient.invalidateQueries({ queryKey: ['deals'] })
  }

  function refreshAfterUndo() {
    setUndoState(null)
    queryClient.invalidateQueries({ queryKey: ['deal-duplicates'] })
    queryClient.invalidateQueries({ queryKey: ['deals'] })
  }

  return (
    <>
      <Modal open onClose={onClose} title="Find Duplicate Deals" size="lg">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-base-400">Scanning for duplicates…</p>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Copy size={28} className="text-base-500" />
            <p className="text-base-300">No likely duplicate deals found.</p>
          </div>
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            {data?.truncated && (
              <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                Only the most recent deals were scanned — this organization has more deals than a single scan covers.
              </p>
            )}
            {groups.map((group: DealDuplicateGroup, idx) => {
              const [first, second, ...rest] = group.deals
              return (
                <div key={idx} className="card space-y-3 p-4">
                  {canMerge && (
                    <div className="flex items-center justify-end">
                      <button
                        className="btn-ghost px-2 text-xs text-base-400"
                        disabled={dismissMutation.isPending}
                        onClick={() => dismissMutation.mutate({ a: first.id, b: second.id })}
                      >
                        <X size={13} />
                        Not a duplicate
                      </button>
                    </div>
                  )}

                  <DealRow deal={first} />
                  <DealRow deal={second} />
                  {rest.length > 0 && (
                    <p className="text-xs text-base-500">
                      +{rest.length} more possible match{rest.length === 1 ? '' : 'es'} in this group — merge this pair, then re-scan to review the rest.
                    </p>
                  )}

                  {canMerge && (
                    <button className="btn-primary w-full justify-center" onClick={() => setMergingPair({ a: first, b: second })}>
                      <GitMerge size={15} />
                      Compare & Merge
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {mergingPair && (
        <MergeDealsModal dealA={mergingPair.a} dealB={mergingPair.b} onClose={() => setMergingPair(null)} onMerged={handleMerged} />
      )}

      {undoState && (
        <MergeUndoToast
          snapshotId={undoState.snapshotId}
          label={undoState.label}
          onUndo={refreshAfterUndo}
          onDismiss={() => setUndoState(null)}
        />
      )}
    </>
  )
}
