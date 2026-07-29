import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, AlertTriangle, CalendarX } from 'lucide-react'
import { billingApi } from '@/lib/api'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'

const RENEW_SOON_DAYS = 14

/** Visible to every member of an Organization (Admin and User alike) —
 * service interruption on expiry affects the whole team, not just the Admin.
 * Hidden for the Super Admin (belongs to no Organization) and for accounts
 * whose Organization has no subscription cycle established yet. */
export function SubscriptionStatusWidget() {
  const { profile } = useAuth()
  const [showInstructions, setShowInstructions] = useState(false)
  const { data } = useQuery({
    queryKey: ['my-org-billing'],
    queryFn: billingApi.getMyOrganization,
    enabled: profile?.role !== 'super_admin',
  })

  if (!data?.subscription_end_date) return null

  const endDate = new Date(data.subscription_end_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysRemaining = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const expired = daysRemaining < 0
  const renewSoon = !expired && daysRemaining <= RENEW_SOON_DAYS
  const canRenew = isAdminOrAbove(profile?.role)

  const toneClasses = expired
    ? 'bg-danger-bg text-danger'
    : renewSoon
      ? 'bg-warn-bg text-warn'
      : 'bg-base-850 text-base-300'

  return (
    <div className={`rounded-lg px-4 py-3 text-sm ${toneClasses}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          {expired ? <CalendarX size={16} className="shrink-0" /> : renewSoon ? <AlertTriangle size={16} className="shrink-0" /> : <CalendarClock size={16} className="shrink-0" />}
          <p>
            {expired ? (
              <>Your subscription expired on <strong>{endDate.toLocaleDateString()}</strong>.</>
            ) : (
              <>
                Your subscription is active until <strong>{endDate.toLocaleDateString()}</strong> ({daysRemaining} day{daysRemaining === 1 ? '' : 's'}{' '}
                remaining){renewSoon && ' — renew soon'}.
              </>
            )}
          </p>
        </div>
        {canRenew && (
          <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" onClick={() => setShowInstructions((v) => !v)}>
            Renew Now
          </button>
        )}
      </div>
      {showInstructions && (
        <div className="mt-3 whitespace-pre-wrap rounded-lg bg-base-900/60 p-3 text-xs">
          {data.payment_instructions || 'Contact your Super Admin to arrange renewal payment.'}
        </div>
      )}
    </div>
  )
}
