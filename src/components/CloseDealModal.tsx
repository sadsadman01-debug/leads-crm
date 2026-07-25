import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { winLossReasonsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'

const OTHER_VALUE = '__other__'

export function CloseDealModal({
  open,
  dealName,
  isWon,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean
  dealName: string
  isWon: boolean
  onClose: () => void
  onConfirm: (payload: { outcome_reason: string; actual_close_date: string }) => void
  busy: boolean
}) {
  const { data } = useQuery({ queryKey: ['win-loss-reasons'], queryFn: winLossReasonsApi.list })
  const reasons = data?.reasons ?? []
  const [selected, setSelected] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [closeDate, setCloseDate] = useState(new Date().toISOString().slice(0, 10))

  const finalReason = selected === OTHER_VALUE ? customReason.trim() : selected
  const canConfirm = finalReason.length > 0

  return (
    <Modal open={open} onClose={onClose} title={`Mark "${dealName}" Closed ${isWon ? 'Won' : 'Lost'}`}>
      <div className="space-y-4">
        <div>
          <label className="label">{isWon ? 'Win' : 'Loss'} Reason</label>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select a reason…</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.label}>{r.label}</option>
            ))}
            <option value={OTHER_VALUE}>Other…</option>
          </select>
        </div>

        {selected === OTHER_VALUE && (
          <div>
            <label className="label">Custom Reason</label>
            <input
              className="input"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Describe the reason…"
            />
          </div>
        )}

        <div>
          <label className="label">Actual Close Date</label>
          <input type="date" className="input" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className={isWon ? 'btn-primary' : 'btn-danger'}
          disabled={!canConfirm || busy}
          onClick={() => onConfirm({ outcome_reason: finalReason, actual_close_date: closeDate })}
        >
          {busy ? 'Saving…' : `Confirm Closed ${isWon ? 'Won' : 'Lost'}`}
        </button>
      </div>
    </Modal>
  )
}
