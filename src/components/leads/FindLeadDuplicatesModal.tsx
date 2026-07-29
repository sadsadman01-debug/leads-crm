import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, GitMerge, X, Mail, Phone } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge, PriorityBadge, ScoreBadge } from '@/components/ui/Badge'
import { leadsApi } from '@/lib/api'
import { MergeLeadsModal } from './MergeLeadsModal'
import { MergeUndoToast } from '@/components/MergeUndoToast'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'
import type { Lead } from '@/types/lead'
import type { LeadDuplicateGroup, MergedLeadResult } from '@/types/duplicateMerge'

const REASON_LABELS: Record<string, string> = {
  phone: 'Same phone',
  email: 'Same email',
  company_name: 'Similar company name',
}

function LeadRow({ lead }: { lead: Lead }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-base-850 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-base-100">{lead.company_name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-base-400">
          {lead.phone && <span className="flex items-center gap-1"><Phone size={11} />{lead.phone}</span>}
          {lead.email && <span className="flex items-center gap-1"><Mail size={11} />{lead.email}</span>}
          <span>Added {new Date(lead.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <PriorityBadge priority={lead.priority} />
        <ScoreBadge score={lead.score} band={lead.band} />
      </div>
    </div>
  )
}

export function FindLeadDuplicatesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const canMerge = isAdminOrAbove(profile?.role)
  const { data, isLoading } = useQuery({ queryKey: ['lead-duplicates'], queryFn: leadsApi.findDuplicates })
  const groups = data?.groups ?? []

  const [mergingPair, setMergingPair] = useState<{ a: Lead; b: Lead } | null>(null)
  const [undoState, setUndoState] = useState<{ snapshotId: string; label: string } | null>(null)

  const dismissMutation = useMutation({
    mutationFn: ({ a, b }: { a: string; b: string }) => leadsApi.dismissDuplicate(a, b),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-duplicates'] }),
  })

  function handleMerged(result: MergedLeadResult) {
    setMergingPair(null)
    setUndoState({ snapshotId: result.mergeSnapshotId, label: result.company_name })
    queryClient.invalidateQueries({ queryKey: ['lead-duplicates'] })
    queryClient.invalidateQueries({ queryKey: ['leads'] })
  }

  function refreshAfterUndo() {
    setUndoState(null)
    queryClient.invalidateQueries({ queryKey: ['lead-duplicates'] })
    queryClient.invalidateQueries({ queryKey: ['leads'] })
  }

  return (
    <>
      <Modal open onClose={onClose} title="Find Duplicate Leads" size="lg">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-base-400">Scanning for duplicates…</p>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Copy size={28} className="text-base-500" />
            <p className="text-base-300">No likely duplicates found.</p>
          </div>
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            {data?.truncated && (
              <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                Only the {groups.length > 0 ? 'most recent' : ''} leads were scanned — this organization has more leads than a single scan covers.
              </p>
            )}
            {groups.map((group: LeadDuplicateGroup, idx) => {
              const [first, second, ...rest] = group.leads
              return (
                <div key={idx} className="card space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {group.reasons.map((r) => (
                        <Badge key={r} tone="accent">
                          {REASON_LABELS[r] ?? r}
                        </Badge>
                      ))}
                    </div>
                    {canMerge && (
                      <button
                        className="btn-ghost px-2 text-xs text-base-400"
                        disabled={dismissMutation.isPending}
                        onClick={() => dismissMutation.mutate({ a: first.id, b: second.id })}
                      >
                        <X size={13} />
                        Not a duplicate
                      </button>
                    )}
                  </div>

                  <LeadRow lead={first} />
                  <LeadRow lead={second} />
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
        <MergeLeadsModal leadA={mergingPair.a} leadB={mergingPair.b} onClose={() => setMergingPair(null)} onMerged={handleMerged} />
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
