import { useQuery } from '@tanstack/react-query'
import { CircleDollarSign } from 'lucide-react'
import { billingApi } from '@/lib/api'
import { PRICING_TIER_LABELS } from '@/types/billing'

/** Informational only — Admins cannot self-serve pay or modify anything here.
 * All payment collection happens manually, outside the app, coordinated
 * directly with the Super Admin (see the Help/Support Widget to reach them). */
export function OrgBillingNotice() {
  const { data } = useQuery({ queryKey: ['my-org-billing'], queryFn: billingApi.getMyOrganization })
  if (!data || !data.monthly_price_usd) return null

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Billing</h2>
      <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-base-850 px-4 py-3 text-sm text-base-200">
        <CircleDollarSign size={16} className="shrink-0 text-base-400" />
        <p>
          Your plan: <strong className="text-base-100">${data.monthly_price_usd}/month</strong>
          {data.pricing_tier && <span className="text-base-400"> ({PRICING_TIER_LABELS[data.pricing_tier]})</span>}
          {data.next_payment_due_date && (
            <>
              {' '}
              — Next payment due: <strong className="text-base-100">{new Date(data.next_payment_due_date).toLocaleDateString()}</strong>
            </>
          )}
          . Contact support to arrange payment.
        </p>
      </div>
    </div>
  )
}
