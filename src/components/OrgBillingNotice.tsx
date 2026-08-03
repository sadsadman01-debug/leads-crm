import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleDollarSign, XCircle, CheckCircle2 } from 'lucide-react'
import { billingApi, cancellationRequestsApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { PRICING_TIER_LABELS, amountForCycle } from '@/types/billing'
import { CANCELLATION_REASONS } from '@/types/cancellationRequest'

/** Informational only — Admins cannot self-serve pay or modify anything here.
 * All payment collection happens manually, outside the app, coordinated
 * directly with the Super Admin (see the Help/Support Widget to reach them).
 * The one self-service action available is submitting a cancellation
 * request — that never cancels anything by itself, it only notifies the
 * Super Admin and creates a record for them to review and action manually. */
export function OrgBillingNotice() {
  const { data } = useQuery({ queryKey: ['my-org-billing'], queryFn: billingApi.getMyOrganization })
  const [cancelling, setCancelling] = useState(false)
  if (!data || !data.monthly_price_usd) return null

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Billing</h2>
      <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-base-850 px-4 py-3 text-sm text-base-200">
        <CircleDollarSign size={16} className="shrink-0 text-base-400" />
        <p>
          Your plan: <strong className="text-base-100">{amountForCycle(data.billing_cycle, data.monthly_price_usd, data.annual_total_usd)}</strong>
          {data.pricing_tier && <span className="text-base-400"> ({PRICING_TIER_LABELS[data.pricing_tier]})</span>}
          {data.subscription_end_date && (
            <>
              {' '}
              — Subscription active until: <strong className="text-base-100">{new Date(data.subscription_end_date).toLocaleDateString()}</strong>
            </>
          )}
          . Contact support to arrange payment.
        </p>
      </div>
      <div className="mt-4 border-t border-base-700/60 pt-4">
        <button className="btn-ghost px-2 text-sm text-danger" onClick={() => setCancelling(true)}>
          <XCircle size={15} />
          Cancel Subscription
        </button>
      </div>

      {cancelling && <CancelSubscriptionModal onClose={() => setCancelling(false)} />}
    </div>
  )
}

function CancelSubscriptionModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [comments, setComments] = useState('')
  const [confirming, setConfirming] = useState(false)

  const mutation = useMutation({
    mutationFn: () => cancellationRequestsApi.create({ reason, additional_comments: comments.trim() || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-org-billing'] }),
  })

  if (mutation.isSuccess) {
    return (
      <Modal open onClose={onClose} title="Cancellation request submitted">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 size={28} className="text-success" />
          <p className="text-sm text-base-200">
            We've received your request and notified our team. Your subscription stays active as normal — nothing has
            been cancelled automatically. We'll follow up with you directly.
          </p>
        </div>
        <div className="mt-4 flex justify-end border-t border-base-700/60 pt-4">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Cancel Subscription">
      {!confirming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setConfirming(true)
          }}
          className="space-y-4"
        >
          <div>
            <label className="label" htmlFor="cancel-reason">Reason</label>
            <select id="cancel-reason" required className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason…</option>
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cancel-comments">Additional comments (optional)</label>
            <textarea
              id="cancel-comments"
              className="input min-h-[80px] resize-y"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Anything else you'd like us to know?"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-danger" disabled={!reason}>Continue</button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-base-300">
            This will notify our team of your request to cancel — <strong className="text-base-100">it will not immediately
            deactivate your account</strong>. Your subscription stays active exactly as it is now until we've followed up
            with you. Are you sure you want to submit this request?
          </p>
          {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}
          <div className="flex justify-end gap-3 border-t border-base-700/60 pt-4">
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>Back</button>
            <button type="button" className="btn-danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Submitting…' : 'Submit Cancellation Request'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
