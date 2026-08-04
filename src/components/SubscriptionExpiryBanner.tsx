import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { billingApi, renewalPaymentsApi } from '@/lib/api'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'

/** A persistent, non-dismissible warning banner at the top of the Dashboard —
 * visible to every member of the Organization (Admin and User alike, same
 * reasoning as SubscriptionStatusWidget: service interruption affects the
 * whole team). Distinct from that widget's softer 14-day heads-up: this only
 * appears within the centrally configured `subscription_warning_days`
 * threshold (default 5, shared with the Billing dashboard's "Due Soon"
 * status — see billing.ts/computeBillingStatus), and is meant to be
 * impossible to miss rather than an ambient status line. Purely advisory —
 * access itself isn't blocked until subscription_end_date (+ grace period)
 * actually passes, exactly as already enforced server-side. */
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

  if (!data?.subscription_end_date) return null

  const endDate = new Date(data.subscription_end_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysRemaining = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const expired = daysRemaining < 0
  const withinWarningWindow = !expired && daysRemaining <= data.subscription_warning_days

  if (!expired && !withinWarningWindow) return null

  return (
    <div className={`flex flex-col gap-2 rounded-lg px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${expired ? 'bg-danger-bg text-danger' : 'bg-warn-bg text-warn'}`}>
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={18} className="shrink-0" />
        <p className="font-medium">
          {expired
            ? '⚠️ Your subscription has expired — renew now to restore access.'
            : `⚠️ Your subscription expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} — renew now to avoid losing access.`}
        </p>
      </div>
      {canRenew && (
        <button
          className="btn-secondary shrink-0 self-start px-3 py-1.5 text-xs sm:self-auto"
          disabled={requestRenewalMutation.isPending}
          onClick={handleRenewClick}
        >
          {requestRenewalMutation.isPending ? 'Requesting…' : 'Renew Now'}
        </button>
      )}
    </div>
  )
}
