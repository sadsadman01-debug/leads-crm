import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Wallet, AlertCircle } from 'lucide-react'
import { affiliatesApi, payoutMethodsApi, withdrawalsApi } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { maskPayoutDetails, type WithdrawalStatus } from '@/types/affiliate'

const STATUS_TONE: Record<WithdrawalStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  pending: 'neutral',
  processing: 'accent',
  approved: 'success',
  rejected: 'danger',
}

export function WithdrawalsTab() {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [payoutMethodId, setPayoutMethodId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data: dashboard } = useQuery({ queryKey: ['affiliate-dashboard', undefined, undefined], queryFn: () => affiliatesApi.getMyDashboard() })
  const { data: methodsData } = useQuery({ queryKey: ['my-payout-methods'], queryFn: payoutMethodsApi.list })
  const methods = methodsData?.methods ?? []

  const { data: withdrawalsData, isLoading } = useQuery({ queryKey: ['my-withdrawals'], queryFn: withdrawalsApi.listMine })
  const withdrawals = withdrawalsData?.withdrawals ?? []

  const defaultMethod = methods.find((m) => m.is_default)
  const selectedMethodId = payoutMethodId || defaultMethod?.id || ''

  const availableBalance = dashboard?.balances.availableBalance ?? 0
  const minWithdrawal = dashboard?.minWithdrawalUsd ?? 0

  const mutation = useMutation({
    mutationFn: () => withdrawalsApi.create({ amount_usd: Number(amount), payout_method_id: selectedMethodId }),
    onSuccess: () => {
      setAmount('')
      queryClient.invalidateQueries({ queryKey: ['my-withdrawals'] })
      queryClient.invalidateQueries({ queryKey: ['affiliate-dashboard'] })
    },
  })

  function validate(): string | null {
    const n = Number(amount)
    if (!amount || !Number.isFinite(n) || n <= 0) return 'Enter a valid amount'
    if (n > availableBalance) return `Amount exceeds your available balance of ৳${availableBalance}`
    if (minWithdrawal && n < minWithdrawal) return `Minimum withdrawal amount is ৳${minWithdrawal}`
    if (!selectedMethodId) return 'Select a payout method'
    return null
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const err = validate()
    setFormError(err)
    if (!err) mutation.mutate()
  }

  const currentError = formError ?? (amount || payoutMethodId ? validate() : null)

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Withdraw</h2>
        <p className="mb-4 text-xs text-base-400">
          Available Balance: <strong className="text-base-100">৳{availableBalance}</strong>
          {minWithdrawal ? <> · Minimum withdrawal: ৳{minWithdrawal}</> : null}
        </p>

        {methods.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
            <AlertCircle size={16} className="shrink-0" />
            You need to add a Payout Method before you can withdraw. Go to the Payout Methods tab to add one.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Payout Method</label>
              <select className="input" value={selectedMethodId} onChange={(e) => setPayoutMethodId(e.target.value)}>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.method_type === 'mfs' ? '📱' : m.method_type === 'bank_account' ? '🏦' : '₿'} {m.label} — {maskPayoutDetails(m.method_type, m.details)}
                    {m.is_default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Withdrawal Amount (৳)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="input"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setFormError(null)
                }}
              />
            </div>
            {currentError && <p className="text-sm text-danger">{currentError}</p>}
            {mutation.isError && <p className="text-sm text-danger">{(mutation.error as Error).message}</p>}
            <button type="submit" className="btn-primary" disabled={mutation.isPending || Boolean(validate())}>
              {mutation.isPending ? 'Submitting…' : 'Request Withdrawal'}
            </button>
          </form>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Withdrawal History</h2>
        {isLoading ? (
          <p className="text-sm text-base-400">Loading…</p>
        ) : withdrawals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Wallet size={28} className="text-base-500" />
            <p className="text-sm text-base-300">No withdrawals yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-base-800">
                    <td className="py-3 pr-3 text-base-300">{new Date(w.requested_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3 tabular-nums text-base-100">৳{w.actual_amount_sent_usd ?? w.amount_usd}</td>
                    <td className="px-3 py-3 text-base-400">{w.payout_method?.label ?? '—'}</td>
                    <td className="px-3 py-3">
                      <Badge tone={STATUS_TONE[w.status]}>{w.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-base-400">{w.reviewed_at ? new Date(w.reviewed_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
