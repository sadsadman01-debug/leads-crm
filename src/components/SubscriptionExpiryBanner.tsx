import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { billingApi, renewalPaymentsApi } from '@/lib/api'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function CountdownSegment({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-black/15 px-3 py-1.5 min-w-[3.5rem]">
      <span className="text-xl font-bold leading-none tabular-nums sm:text-2xl">{String(value).padStart(2, '0')}</span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wide opacity-80">{label}</span>
    </div>
  )
}

/** A persistent, non-dismissible warning banner at the top of the Dashboard —
 * visible to every member of the Organization (Admin and User alike, same
 * reasoning as SubscriptionStatusWidget: service interruption affects the
 * whole team). Distinct from that widget's softer 14-day heads-up: this only
 * appears within the centrally configured `subscription_warning_days`
 * threshold (default 5, shared with the Billing dashboard's "Due Soon"
 * status — see billing.ts/computeBillingStatus), and is meant to be
 * impossible to miss rather than an ambient status line. Purely advisory —
 * access itself isn't blocked until subscription_end_date (+ grace period)
 * actually passes, exactly as already enforced server-side. A live
 * Days/Hours/Minutes countdown re-renders once a minute (no per-second
 * precision needed) purely for display — the warning-window/expired GATING
 * below still uses the same day-truncated comparison as before, unchanged. */
export function SubscriptionExpiryBanner() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canRenew = isAdminOrAbove(profile?.role)

  const { data } = useQuery({
    queryKey: ['my-org-billing'],
    queryFn: billingApi.getMyOrganization,
    enabled: profile?.role !== 'super_admin',
  })
  const { data: pendingData } = useQuery({
    queryKey: ['my-pending-renewal'],
    queryFn: renewalPaymentsApi.getMyPending,
    enabled: canRenew,
  })
  const pendingRenewal = pendingData?.renewal ?? null

  const requestRenewalMutation = useMutation({
    mutationFn: () => renewalPaymentsApi.create(),
    onSuccess: (renewal) => {
      queryClient.invalidateQueries({ queryKey: ['my-pending-renewal'] })
      navigate(`/pay?renewal_token=${renewal.payment_token}`)
    },
  })

  function handleRenewClick() {
    if (pendingRenewal) navigate(`/pay?renewal_token=${pendingRenewal.payment_token}`)
    else requestRenewalMutation.mutate()
  }

  // Live "now", recalculated once a minute so the countdown updates without
  // a page refresh — this is display-only; the warning-window/expired
  // determination below is unaffected by how often this ticks.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => clearInterval(id)
  }, [])

  if (!data?.subscription_end_date) return null

  const endDate = new Date(data.subscription_end_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysRemaining = Math.round((endDate.getTime() - today.getTime()) / DAY_MS)
  const expired = daysRemaining < 0
  const withinWarningWindow = !expired && daysRemaining <= data.subscription_warning_days

  if (!expired && !withinWarningWindow) return null

  // Live countdown, for display only — switches to the Expired state the
  // moment it reaches zero, independent of the day-truncated gating above.
  const msRemaining = endDate.getTime() - now
  const countdownExpired = msRemaining <= 0
  const days = Math.floor(msRemaining / DAY_MS)
  const hours = Math.floor((msRemaining % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((msRemaining % HOUR_MS) / MINUTE_MS)

  const showExpired = expired || countdownExpired
  const toneClasses = showExpired ? 'bg-danger-bg text-danger' : 'bg-warn-bg text-warn'

  return (
    <div className={`flex flex-col gap-4 rounded-xl px-5 py-5 text-sm sm:flex-row sm:items-center sm:justify-between ${toneClasses}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <AlertTriangle size={28} className="shrink-0" />
        <div>
          <p className="text-base font-semibold sm:text-lg">
            {showExpired ? '⚠️ Your subscription has expired' : '⚠️ Your subscription is expiring soon'}
          </p>
          <p className="mt-0.5 text-sm opacity-90">
            {showExpired ? 'Renew now to restore access.' : 'Renew now to avoid losing access.'}
          </p>
        </div>
        {!showExpired && (
          <div className="flex items-center gap-2">
            <CountdownSegment value={days} label={days === 1 ? 'Day' : 'Days'} />
            <CountdownSegment value={hours} label={hours === 1 ? 'Hour' : 'Hours'} />
            <CountdownSegment value={minutes} label={minutes === 1 ? 'Min' : 'Mins'} />
          </div>
        )}
      </div>
      {canRenew && (
        <button
          className="btn-secondary shrink-0 self-start px-4 py-2 text-sm font-medium sm:self-auto"
          disabled={requestRenewalMutation.isPending}
          onClick={handleRenewClick}
        >
          {requestRenewalMutation.isPending ? 'Requesting…' : 'Renew Now'}
        </button>
      )}
    </div>
  )
}
