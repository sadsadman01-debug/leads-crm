import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { winLossReasonsApi } from '@/lib/api'
import type { WinLossReason } from '@/types/deal'

function ReasonRow({
  reason,
  onRename,
  onDelete,
}: {
  reason: WinLossReason
  onRename: (id: string, label: string) => void
  onDelete: (id: string) => void
}) {
  const [label, setLabel] = useState(reason.label)
  useEffect(() => setLabel(reason.label), [reason.label])

  return (
    <div className="flex items-center gap-2 rounded-lg border border-base-700/60 bg-base-850 px-3 py-2.5">
      <input
        className="input flex-1"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          const trimmed = label.trim()
          if (trimmed && trimmed !== reason.label) onRename(reason.id, trimmed)
          else setLabel(reason.label)
        }}
      />
      <button className="btn-ghost px-2 hover:text-danger" onClick={() => onDelete(reason.id)} title="Delete reason">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

export function WinLossReasonsSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['win-loss-reasons'], queryFn: winLossReasonsApi.list })
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['win-loss-reasons'] })
  }

  const createMutation = useMutation({
    mutationFn: (label: string) => winLossReasonsApi.create(label),
    onSuccess: () => {
      invalidate()
      setNewLabel('')
      setError(null)
    },
    onError: (e: any) => setError(e?.message ?? 'Could not create reason'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => winLossReasonsApi.rename(id, label),
    onSuccess: invalidate,
    onError: (e: any) => setError(e?.message ?? 'Could not rename reason'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => winLossReasonsApi.remove(id),
    onSuccess: invalidate,
  })

  const reasons = data?.reasons ?? []

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Win / Loss Reasons</h2>
      <p className="mb-4 text-xs text-base-400">
        Suggested reasons shown when closing a deal as Won or Lost. An "Other" free-text option is always available
        on the deal itself regardless of this list.
      </p>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-base-400">Loading reasons…</p>
      ) : (
        <div className="space-y-2">
          {reasons.map((reason) => (
            <ReasonRow
              key={reason.id}
              reason={reason}
              onRename={(id, label) => {
                setError(null)
                renameMutation.mutate({ id, label })
              }}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newLabel.trim()) createMutation.mutate(newLabel.trim())
        }}
      >
        <input
          className="input flex-1"
          placeholder="New reason, e.g. Lost to internal hire"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button type="submit" className="btn-secondary" disabled={!newLabel.trim() || createMutation.isPending}>
          <Plus size={16} />
          Add Reason
        </button>
      </form>
    </div>
  )
}
