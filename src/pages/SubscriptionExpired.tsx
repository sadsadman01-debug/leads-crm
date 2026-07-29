import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, LogOut } from 'lucide-react'
import { billingApi, ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { PreAuthHelpWidget } from '@/components/PreAuthHelpWidget'
import { amountForCycle } from '@/types/billing'
import type { SubscriptionExpiredDetails } from '@/types/billing'

/** Reached whenever any authenticated call comes back blocked because this
 * account's Organization subscription has expired (see requireUser server-
 * side, and <SubscriptionGuard/> which redirects here). Deliberately calls
 * an endpoint that will 402 again on mount — that failure's own payload IS
 * the exact expiry/pricing/payment-instructions data this screen renders,
 * so a page refresh here always shows fresh, accurate figures with no
 * separate "unblocked" endpoint needed. */
export function SubscriptionExpired() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [details, setDetails] = useState<SubscriptionExpiredDetails | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    billingApi
      .getMyOrganization()
      .then(() => {
        // Subscription is active again (renewal was recorded) — nothing to block.
        navigate('/leads', { replace: true })
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 402 && err.details?.error === 'subscription_expired') {
          setDetails(err.details)
        }
        setLoading(false)
      })
  }, [navigate])

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base-950 px-4 py-8 animate-fadeIn">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-warn/10 blur-[120px]" />
      </div>

      <div className="card relative w-full max-w-md p-8 animate-slideUp">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-warn/15">
            <CalendarClock size={24} className="text-warn" />
          </div>
          <h1 className="text-xl font-semibold text-base-100">Subscription Expired</h1>
          <p className="mt-2 text-sm text-base-400">
            Your organization's subscription has ended. Access is paused until a renewal payment is confirmed — your
            data is safe and will be right where you left it.
          </p>
        </div>

        {!loading && details && (
          <div className="mb-6 space-y-3 rounded-lg bg-base-850 p-4 text-sm">
            <p className="text-base-200">
              Subscription ended: <strong className="text-base-100">{new Date(details.subscription_end_date).toLocaleDateString()}</strong>
            </p>
            <p className="text-base-200">
              Amount due to renew:{' '}
              <strong className="text-base-100">{amountForCycle(details.billing_cycle, details.monthly_price_usd, details.annual_total_usd)}</strong>
            </p>
            {details.payment_instructions && (
              <div className="border-t border-base-700/60 pt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-base-400">How to Pay</p>
                <p className="whitespace-pre-wrap text-xs text-base-400">{details.payment_instructions}</p>
              </div>
            )}
          </div>
        )}

        <p className="mb-6 text-center text-xs text-base-500">
          Once your Super Admin confirms the payment, access is restored automatically — just come back and refresh.
        </p>

        <button className="btn-secondary w-full justify-center" onClick={() => signOut()}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
      <PreAuthHelpWidget />
    </div>
  )
}
