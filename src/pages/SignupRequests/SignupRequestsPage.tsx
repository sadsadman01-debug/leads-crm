import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus2, Mail, Phone } from 'lucide-react'
import { signupRequestsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { PRICING_TIER_LABELS, type PaymentStatus } from '@/types/billing'
import type { SignupRequest, SignupRequestStatus } from '@/types/signupRequest'
import { ApproveFlow } from './ApproveFlow'
import { RejectModal } from './RejectModal'

const PAYMENT_STATUS_TONE: Record<PaymentStatus, 'warn' | 'success' | 'neutral'> = {
  pending: 'warn',
  received: 'success',
  waived: 'neutral',
}

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

const STATUS_TONE: Record<SignupRequestStatus, 'warn' | 'success' | 'danger'> = {
  pending: 'warn',
  approved: 'success',
  rejected: 'danger',
}

export function SignupRequestsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('pending')
  const [approving, setApproving] = useState<SignupRequest | null>(null)
  const [rejecting, setRejecting] = useState<SignupRequest | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['signup-requests'], queryFn: signupRequestsApi.list })
  const requests = data?.requests ?? []

  const paymentStatusMutation = useMutation({
    mutationFn: ({ id, payment_status }: { id: string; payment_status: PaymentStatus }) =>
      signupRequestsApi.updatePaymentStatus(id, payment_status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup-requests'] }),
  })

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])

  const filtered = useMemo(() => {
    if (tab === 'all') return requests
    return requests.filter((r) => r.status === tab)
  }, [requests, tab])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Signup Requests</h1>
        <p className="mt-1 text-sm text-base-400">
          Review and manually approve or reject requests submitted from the login page's "Request Access" form.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
        {(['pending', 'approved', 'rejected', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'pending' && pendingCount > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${tab === t ? 'bg-white/20' : 'bg-warn-bg text-warn'}`}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-base-400">Loading requests…</div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <UserPlus2 size={32} className="text-base-500" />
          <p className="text-base-300">No {tab === 'all' ? '' : tab} requests.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-6">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium">Pricing</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 font-medium">Requested</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-base-800 align-top">
                  <td className="py-3 pr-3 font-medium text-base-100">{r.organization_name}</td>
                  <td className="px-3 py-3 text-base-300">
                    <div>{r.contact_name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-base-400">
                      <Mail size={12} className="shrink-0" />
                      <span className="truncate">{r.email}</span>
                    </div>
                    {r.phone && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-base-400">
                        <Phone size={12} className="shrink-0" />
                        {r.phone}
                      </div>
                    )}
                  </td>
                  <td className="max-w-[260px] px-3 py-3 text-xs text-base-400">
                    {r.message || <span className="text-base-500">—</span>}
                  </td>
                  <td className="px-3 py-3 text-base-300">
                    {r.pricing_tier ? (
                      <div>
                        <p className="font-medium text-base-100">${r.monthly_price_usd}/mo</p>
                        <p className="text-xs text-base-500">{PRICING_TIER_LABELS[r.pricing_tier]}</p>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {r.status === 'pending' ? (
                      <select
                        className="input w-auto py-1 text-xs"
                        value={r.payment_status}
                        disabled={paymentStatusMutation.isPending}
                        onChange={(e) => paymentStatusMutation.mutate({ id: r.id, payment_status: e.target.value as PaymentStatus })}
                      >
                        <option value="pending">Pending</option>
                        <option value="received">Received</option>
                        <option value="waived">Waived</option>
                      </select>
                    ) : (
                      <Badge tone={PAYMENT_STATUS_TONE[r.payment_status]}>{r.payment_status}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-base-400">{new Date(r.requested_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    {r.status === 'rejected' && r.rejection_reason && (
                      <p className="mt-1 max-w-[160px] text-xs text-base-500">{r.rejection_reason}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {r.status === 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-ghost px-2 text-success" onClick={() => setApproving(r)}>
                          Approve
                        </button>
                        <button className="btn-ghost px-2 text-danger" onClick={() => setRejecting(r)}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ApproveFlow request={approving} onClose={() => setApproving(null)} />
      <RejectModal request={rejecting} onClose={() => setRejecting(null)} />
    </div>
  )
}
