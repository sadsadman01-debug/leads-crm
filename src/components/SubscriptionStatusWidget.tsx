import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, AlertTriangle, CalendarX } from 'lucide-react'
import { billingApi, renewalPaymentsApi } from '@/lib/api'
import { useAuth, isAdminOrAbove } from '@/contexts/AuthContext'
import { CopyButton } from '@/components/TempPasswordResult'

const RENEW_SOON_DAYS = 14

/** Visible to every member of an Organization (Admin and User alike) —
 * service interruption on expiry affects the whole team, not just the Admin.
 * Hidden for the Super Admin (belongs to no Organization) and for accounts
 * whose Organization has no subscription cycle established yet. */
export function SubscriptionStatusWidget() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showInstructions, setShowInstructions] = useState(false)
  const { data } = useQuery({
    queryKey: ['my-org-billing'],
    queryFn: billingApi.getMyOrganization,
    enabled: profile?.role !== 'super_admin',
  })
  const canRenew = isAdminOrAbove(profile?.role)
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

  if (!data?.subscription_end_date) return null

  const endDate = new Date(data.subscription_end_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysRemaining = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const expired = daysRemaining < 0
  const renewSoon = !expired && daysRemaining <= RENEW_SOON_DAYS

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
          <div className="flex shrink-0 items-center gap-2">
            {pendingRenewal && (
              <button
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() => navigate(`/pay?renewal_token=${pendingRenewal.payment_token}`)}
              >
                Continue to Payment
              </button>
            )}
            <button
              className="btn-secondary px-3 py-1.5 text-xs"
              disabled={requestRenewalMutation.isPending}
              onClick={() => (pendingRenewal ? setShowInstructions((v) => !v) : requestRenewalMutation.mutate())}
            >
              {requestRenewalMutation.isPending ? 'Requesting…' : pendingRenewal ? 'Renewal Details' : 'Request Renewal'}
            </button>
          </div>
        )}
      </div>
      {pendingRenewal && showInstructions && (
        <div className="mt-3 rounded-lg bg-base-900/60 p-3 text-xs">
          <p className="text-base-400">Your pending renewal's reference code:</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="select-all font-mono text-base font-bold tracking-widest text-accent-400">{pendingRenewal.payment_reference_code}</span>
            <CopyButton text={pendingRenewal.payment_reference_code} label="Copy" />
          </div>
          <p className="mt-2 text-base-500">Amount: ৳{pendingRenewal.amount_bdt}</p>
          {data.payment_instructions && <p className="mt-2 whitespace-pre-wrap">{data.payment_instructions}</p>}
        </div>
      )}
    </div>
  )
}
