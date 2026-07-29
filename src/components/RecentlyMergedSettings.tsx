import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitMerge, Undo2, CheckCircle2 } from 'lucide-react'
import { mergeSnapshotsApi } from '@/lib/api'

/** Recovery screen for merges outside the immediate post-merge "Undo" toast
 * window — same restore mechanism, just reachable later. Merges never
 * disappear from this list on their own (no automatic cleanup job), so a
 * restored entry just shows as such rather than vanishing. */
export function RecentlyMergedSettings() {
  const queryClient = useQueryClient()
  const [justRestoredId, setJustRestoredId] = useState<string | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['merge-snapshots'], queryFn: mergeSnapshotsApi.list })
  const snapshots = data?.snapshots ?? []

  const restoreMutation = useMutation({
    mutationFn: (id: string) => mergeSnapshotsApi.restore(id),
    onSuccess: (_data, id) => {
      setJustRestoredId(id)
      queryClient.invalidateQueries({ queryKey: ['merge-snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      setTimeout(() => setJustRestoredId(null), 4000)
    },
  })

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Recently Merged</h2>
      <p className="mb-5 text-xs text-base-400">
        Leads and Deals merged via the Duplicate Merge tool. Restoring recreates the merged-away record and reverts
        anything the merge changed on the surviving record.
      </p>

      {isLoading ? (
        <p className="text-sm text-base-400">Loading…</p>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-base-400">No merges recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {snapshots.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-base-850 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <GitMerge size={15} className="shrink-0 text-base-400" />
                <div>
                  <p className="text-sm text-base-200">
                    <span className="font-medium text-base-100">{s.loser_label ?? 'Unknown'}</span> merged
                    {s.merged_by_name ? ` by ${s.merged_by_name}` : ''}
                  </p>
                  <p className="text-xs text-base-500">
                    {new Date(s.merged_at).toLocaleString()} · {s.record_type === 'lead' ? 'Lead' : 'Deal'}
                  </p>
                </div>
              </div>
              {s.restored_at || justRestoredId === s.id ? (
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 size={13} />
                  Restored
                </span>
              ) : (
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  disabled={restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate(s.id)}
                >
                  <Undo2 size={13} />
                  {restoreMutation.isPending ? 'Restoring…' : 'Restore'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
