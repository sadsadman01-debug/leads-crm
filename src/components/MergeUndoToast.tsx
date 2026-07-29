import { useEffect, useState } from 'react'
import { Undo2, CheckCircle2, X } from 'lucide-react'
import { mergeSnapshotsApi } from '@/lib/api'

const UNDO_WINDOW_MS = 15_000

/** Brief post-merge confirmation with a working "Undo" — reverses the merge
 * via the same restore mechanism that also backs the Recently Merged
 * recovery screen in Settings (that screen just keeps this window open much
 * longer). Auto-dismisses after 15s or on navigation away (unmount). */
export function MergeUndoToast({
  snapshotId,
  label,
  onUndo,
  onDismiss,
}: {
  snapshotId: string
  label: string
  onUndo: () => void
  onDismiss: () => void
}) {
  const [undoing, setUndoing] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(Math.round(UNDO_WINDOW_MS / 1000))

  useEffect(() => {
    const interval = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    const timeout = setTimeout(onDismiss, UNDO_WINDOW_MS)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleUndo() {
    setUndoing(true)
    try {
      await mergeSnapshotsApi.restore(snapshotId)
      onUndo()
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl border border-base-700/60 bg-base-900 px-4 py-3 shadow-lg animate-fadeIn">
        <CheckCircle2 size={18} className="shrink-0 text-success" />
        <p className="text-sm text-base-200">
          Merged <span className="font-medium text-base-100">{label}</span>. ({secondsLeft}s)
        </p>
        <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" disabled={undoing} onClick={handleUndo}>
          <Undo2 size={13} />
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
        <button onClick={onDismiss} className="btn-ghost h-8 w-8 shrink-0 px-0" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
