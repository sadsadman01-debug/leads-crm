import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleDollarSign, Receipt, Undo2, History, XCircle, RotateCcw } from 'lucide-react'
import { billingApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import {
  PRICING_TIER_LABELS,
  amountForCycle,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type BillingStatus,
  type OrganizationBillingRow,
  type PaymentMethod,
} from '@/types/billing'

const STATUS_TONE: Record<BillingStatus, 'success' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  paid: 'success',
  due_soon: 'warn',
  overdue: 'danger',
  pending: 'neutral',
  cancelled: 'accent',
}

const STATUS_LABELS: Record<BillingStatus, string> = {
  paid: 'Paid',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  pending: 'No payment yet',
  cancelled: 'Cancelled',
}

export function BillingPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['billing'], queryFn: billingApi.list })
  const organizations = data?.organizations ?? []
  const [recording, setRecording] = useState<OrganizationBillingRow | null>(null)
  const [refunding, setRefunding] = useState<OrganizationBillingRow | null>(null)
  const [viewingHistory, setViewingHistory] = useState<OrganizationBillingRow | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['billing'] })
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => billingApi.cancelSubscription(id),
    onSuccess: invalidate,
  })
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => billingApi.reactivateSubscription(id),
    onSuccess: invalidate,
  })

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
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Subscription Ends</th>
                <th className="px-3 py-2 font-medium">Payment Method</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} className="border-b border-base-800 align-top">
                  <td className="py-3 pr-3 font-medium text-base-100">{org.name}</td>
                  <td className="px-3 py-3 text-base-300">{org.pricing_tier ? PRICING_TIER_LABELS[org.pricing_tier] : '—'}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">
                    {amountForCycle(org.billing_cycle, org.monthly_price_usd, org.annual_total_usd)}
                  </td>
                  <td className="px-3 py-3 text-base-400">
                    {org.subscription_end_date ? new Date(org.subscription_end_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-3 text-base-400">
                    {org.payment_method ? PAYMENT_METHOD_LABELS[org.payment_method] : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[org.billing_status]}>{STATUS_LABELS[org.billing_status]}</Badge>
                    {org.subscription_cancelled_at && (
                      <p className="mt-1 text-xs text-base-500">
                        Access continues until expiry — not renewing.
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <button className="btn-ghost px-2 text-xs text-accent-400" onClick={() => setRecording(org)}>
                        <Receipt size={13} />
                        Record Payment Received
                      </button>
                      <button className="btn-ghost px-2 text-xs text-warn" onClick={() => setRefunding(org)}>
                        <Undo2 size={13} />
                        Record Refund
                      </button>
                      <button className="btn-ghost px-2 text-xs text-base-300" onClick={() => setViewingHistory(org)}>
                        <History size={13} />
                        View History
                      </button>
                      {org.subscription_cancelled_at ? (
                        <button
                          className="btn-ghost px-2 text-xs text-success"
                          disabled={reactivateMutation.isPending}
                          onClick={() => reactivateMutation.mutate(org.id)}
                        >
                          <RotateCcw size={13} />
                          Reactivate
                        </button>
                      ) : (
                        <button
                          className="btn-ghost px-2 text-xs text-danger"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(org.id)}
                        >
                          <XCircle size={13} />
                          Mark Cancelled
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordPaymentModal org={recording} onClose={() => setRecording(null)} />
      <RecordRefundModal org={refunding} onClose={() => setRefunding(null)} />
      <BillingHistoryModal org={viewingHistory} onClose={() => setViewingHistory(null)} />
    </div>
  )
}

function RecordPaymentModal({ org, onClose }: { org: OrganizationBillingRow | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [extendFrom, setExtendFrom] = useState<'current_expiry' | 'payment_date'>('current_expiry')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')

  function reset() {
    setAmount('')
    setPaidAt(new Date().toISOString().slice(0, 10))
    setNotes('')
    setExtendFrom('current_expiry')
    setPaymentMethod('')
  }

  useEffect(() => {
    if (!org) return
    setAmount(org.monthly_price_usd != null ? String(org.billing_cycle === 'annual' ? org.annual_total_usd : org.monthly_price_usd) : '')
    setExtendFrom(org.billing_status === 'overdue' ? 'payment_date' : 'current_expiry')
    setPaymentMethod(org.payment_method ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id])

  const mutation = useMutation({
    mutationFn: () =>
      billingApi.recordPayment(org!.id, {
        amount_usd: Number(amount),
        paid_at: paidAt,
        notes: notes.trim() || undefined,
        extend_from: extendFrom,
        payment_method: paymentMethod as PaymentMethod,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      onClose()
      reset()
    },
  })

  if (!org) return null

  const periodLabel = org.billing_cycle === 'annual' ? 'one year' : 'one month'

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
          <label className="label">Amount (৳)</label>
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
          <label className="label">Payment Method</label>
          <select className="input" required value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="">Select payment method…</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paid via Payoneer, ref #12345" />
        </div>
        <div>
          <label className="label">Extend subscription from</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExtendFrom('current_expiry')}
              className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                extendFrom === 'current_expiry' ? 'border-accent-500 bg-accent-500/15 text-accent-400' : 'border-base-700/60 text-base-300 hover:bg-base-800'
              }`}
            >
              <span className="block font-medium">Current expiry date</span>
              <span className="block text-base-500">Renewing on time or early</span>
            </button>
            <button
              type="button"
              onClick={() => setExtendFrom('payment_date')}
              className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                extendFrom === 'payment_date' ? 'border-accent-500 bg-accent-500/15 text-accent-400' : 'border-base-700/60 text-base-300 hover:bg-base-800'
              }`}
            >
              <span className="block font-medium">Today's payment date</span>
              <span className="block text-base-500">Renewing after expiry</span>
            </button>
          </div>
        </div>
        <p className="text-xs text-base-500">
          Subscription end date will advance by exactly {periodLabel} from the base date selected above.
        </p>
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

function RecordRefundModal({ org, onClose }: { org: OrganizationBillingRow | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [refundDate, setRefundDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [billingHistoryId, setBillingHistoryId] = useState('')
  const [adjustExpiry, setAdjustExpiry] = useState(false)
  const [newExpiryDate, setNewExpiryDate] = useState('')

  const { data: history } = useQuery({
    queryKey: ['billing-history', org?.id],
    queryFn: () => billingApi.getHistory(org!.id),
    enabled: Boolean(org),
  })

  function reset() {
    setAmount('')
    setRefundDate(new Date().toISOString().slice(0, 10))
    setReason('')
    setBillingHistoryId('')
    setAdjustExpiry(false)
    setNewExpiryDate('')
  }

  const mutation = useMutation({
    mutationFn: () =>
      billingApi.recordRefund(org!.id, {
        amount_bdt: Number(amount),
        refund_date: refundDate,
        reason: reason.trim() || undefined,
        billing_history_id: billingHistoryId || undefined,
        new_subscription_end_date: adjustExpiry && newExpiryDate ? newExpiryDate : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      queryClient.invalidateQueries({ queryKey: ['billing-history', org?.id] })
      onClose()
      reset()
    },
  })

  if (!org) return null

  return (
    <Modal open onClose={onClose} title={`Record Refund — ${org.name}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">Amount Refunded (৳)</label>
          <input type="number" min={0} step={0.01} required className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Refund Date</label>
          <input type="date" required className="input" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Related Payment</label>
          <select className="input" value={billingHistoryId} onChange={(e) => setBillingHistoryId(e.target.value)}>
            <option value="">Other / Not tied to a specific payment</option>
            {(history?.payments ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                ৳{p.amount_usd} on {new Date(p.paid_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Reason (optional)</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer dissatisfaction" />
        </div>
        <div className="rounded-lg border border-base-700/60 bg-base-850 p-3">
          <label className="flex items-center gap-2 text-sm text-base-200">
            <input type="checkbox" className="h-4 w-4 rounded border-base-600 bg-base-800" checked={adjustExpiry} onChange={(e) => setAdjustExpiry(e.target.checked)} />
            Should this refund also reduce their subscription expiry?
          </label>
          {adjustExpiry && (
            <div className="mt-3">
              <label className="label">New Subscription End Date</label>
              <input type="date" className="input" value={newExpiryDate} onChange={(e) => setNewExpiryDate(e.target.value)} />
              <p className="mt-1 text-xs text-base-500">
                Current expiry: {org.subscription_end_date ? new Date(org.subscription_end_date).toLocaleDateString() : '—'}. Leave blank to make no change.
              </p>
            </div>
          )}
        </div>
        {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Refund'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function BillingHistoryModal({ org, onClose }: { org: OrganizationBillingRow | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['billing-history', org?.id],
    queryFn: () => billingApi.getHistory(org!.id),
    enabled: Boolean(org),
  })

  if (!org) return null

  return (
    <Modal open onClose={onClose} title={`Billing & Cancellation History — ${org.name}`} size="lg">
      {!data ? (
        <p className="text-sm text-base-400">Loading…</p>
      ) : data.timeline.length === 0 ? (
        <p className="text-sm text-base-400">No payments, refunds, or cancellation requests yet.</p>
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {data.timeline.map((entry) => (
            <div key={`${entry.type}-${entry.id}`} className="rounded-lg border border-base-700/60 bg-base-850 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-base-100">
                  {entry.type === 'payment' && 'Payment Received'}
                  {entry.type === 'refund' && 'Refund'}
                  {entry.type === 'cancellation_request' && 'Cancellation Request'}
                </span>
                <span className="text-xs text-base-500">{new Date(entry.date).toLocaleDateString()}</span>
              </div>
              {entry.type === 'payment' && (
                <p className="mt-1 text-xs text-base-400">
                  ৳{entry.amount_bdt} {entry.payment_method && `via ${PAYMENT_METHOD_LABELS[entry.payment_method as PaymentMethod] ?? entry.payment_method}`}
                  {entry.notes && ` — ${entry.notes}`}
                </p>
              )}
              {entry.type === 'refund' && (
                <p className="mt-1 text-xs text-warn">
                  −৳{Math.abs(entry.amount_bdt)}{entry.reason && ` — ${entry.reason}`}
                </p>
              )}
              {entry.type === 'cancellation_request' && (
                <p className="mt-1 text-xs text-base-400">
                  {entry.reason}
                  {entry.additional_comments && ` — ${entry.additional_comments}`}
                  {' — '}
                  <span className={entry.status === 'acknowledged' ? 'text-success' : 'text-warn'}>{entry.status}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end border-t border-base-700/60 pt-4">
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
