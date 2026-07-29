import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleDollarSign, Receipt } from 'lucide-react'
import { billingApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PRICING_TIER_LABELS, type BillingStatus, type OrganizationBillingRow } from '@/types/billing'

const STATUS_TONE: Record<BillingStatus, 'success' | 'warn' | 'danger' | 'neutral'> = {
  paid: 'success',
  due_soon: 'warn',
  overdue: 'danger',
  pending: 'neutral',
}

const STATUS_LABELS: Record<BillingStatus, string> = {
  paid: 'Paid',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  pending: 'No payment yet',
}

export function BillingPage() {
  const { data, isLoading } = useQuery({ queryKey: ['billing'], queryFn: billingApi.list })
  const organizations = data?.organizations ?? []
  const [recording, setRecording] = useState<OrganizationBillingRow | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Billing</h1>
        <p className="mt-1 text-sm text-base-400">
          Manual payment tracking — no gateway is connected. Record a payment here once you've confirmed it via Payoneer.
        </p>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : organizations.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <CircleDollarSign size={32} className="text-base-500" />
          <p className="text-base-300">No organizations yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Monthly Price</th>
                <th className="px-3 py-2 font-medium">Next Payment Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} className="border-b border-base-800">
                  <td className="py-3 pr-3 font-medium text-base-100">{org.name}</td>
                  <td className="px-3 py-3 text-base-300">{org.pricing_tier ? PRICING_TIER_LABELS[org.pricing_tier] : '—'}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{org.monthly_price_usd != null ? `$${org.monthly_price_usd}` : '—'}</td>
                  <td className="px-3 py-3 text-base-400">
                    {org.next_payment_due_date ? new Date(org.next_payment_due_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[org.billing_status]}>{STATUS_LABELS[org.billing_status]}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <button className="btn-ghost px-2 text-accent-400" onClick={() => setRecording(org)}>
                      <Receipt size={14} />
                      Record Payment Received
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordPaymentModal org={recording} onClose={() => setRecording(null)} />
    </div>
  )
}

function RecordPaymentModal({ org, onClose }: { org: OrganizationBillingRow | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  function reset() {
    setAmount('')
    setPaidAt(new Date().toISOString().slice(0, 10))
    setNotes('')
  }

  useEffect(() => {
    if (org) setAmount(org.monthly_price_usd != null ? String(org.monthly_price_usd) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id])

  const mutation = useMutation({
    mutationFn: () =>
      billingApi.recordPayment(org!.id, { amount_usd: Number(amount), paid_at: paidAt, notes: notes.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      onClose()
      reset()
    },
  })

  if (!org) return null

  return (
    <Modal open onClose={onClose} title={`Record Payment — ${org.name}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Amount ($)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            required
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Payment Date</label>
          <input type="date" required className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paid via Payoneer, ref #12345" />
        </div>
        <p className="text-xs text-base-500">Next payment due date will advance to exactly one month after the payment date above.</p>
        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
