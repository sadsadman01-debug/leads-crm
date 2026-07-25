import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { quotasApi, teamApi, settingsApi } from '@/lib/api'
import { formatCurrency } from '@/lib/currency'

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}
function currentQuarterKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`
}

export function QuotaSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['quotas'], queryFn: quotasApi.list })
  const { data: rosterData } = useQuery({ queryKey: ['team-roster'], queryFn: teamApi.roster })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const quotas = data?.quotas ?? []

  const [userId, setUserId] = useState('')
  const [periodType, setPeriodType] = useState<'month' | 'quarter'>('month')
  const [periodKey, setPeriodKey] = useState(currentMonthKey())
  const [amount, setAmount] = useState('')

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['quotas'] })
    queryClient.invalidateQueries({ queryKey: ['forecast'] })
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      quotasApi.upsert({
        user_id: userId || null,
        period_type: periodType,
        period_key: periodKey,
        amount: Number(amount) || 0,
        currency: settings?.default_currency ?? 'USD',
      }),
    onSuccess: () => {
      invalidate()
      setAmount('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => quotasApi.remove(id),
    onSuccess: invalidate,
  })

  const nameById = new Map((rosterData?.members ?? []).map((m) => [m.id, m.nickname || m.email]))

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Revenue Quotas</h2>
      <p className="mb-4 text-xs text-base-400">
        Set a monthly or quarterly revenue goal for the whole organization, or for an individual team member — used
        by the Forecast tab's progress tracking.
      </p>

      <form
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (amount) saveMutation.mutate()
        }}
      >
        <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Whole Organization</option>
          {(rosterData?.members ?? []).map((m) => (
            <option key={m.id} value={m.id}>{m.nickname || m.email}</option>
          ))}
        </select>
        <select
          className="input"
          value={periodType}
          onChange={(e) => {
            const pt = e.target.value as 'month' | 'quarter'
            setPeriodType(pt)
            setPeriodKey(pt === 'month' ? currentMonthKey() : currentQuarterKey())
          }}
        >
          <option value="month">Monthly</option>
          <option value="quarter">Quarterly</option>
        </select>
        <input
          className="input"
          value={periodKey}
          onChange={(e) => setPeriodKey(e.target.value)}
          placeholder={periodType === 'month' ? 'YYYY-MM' : 'YYYY-Q#'}
        />
        <input
          type="number"
          min={0}
          className="input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Quota amount"
        />
        <button type="submit" className="btn-secondary" disabled={!amount || saveMutation.isPending}>
          <Plus size={16} />
          Set Quota
        </button>
      </form>

      {quotas.length === 0 ? (
        <p className="text-sm text-base-400">No quotas set yet.</p>
      ) : (
        <div className="space-y-2">
          {quotas.map((q) => (
            <div key={q.id} className="flex items-center gap-3 rounded-lg border border-base-700/60 bg-base-850 px-3 py-2.5 text-sm">
              <span className="flex-1 text-base-200">
                {q.user_id ? nameById.get(q.user_id) ?? 'Unknown member' : 'Whole Organization'} — {q.period_key} ({q.period_type})
              </span>
              <span className="font-semibold text-base-100">{formatCurrency(q.amount, q.currency)}</span>
              <button className="btn-ghost px-2 hover:text-danger" onClick={() => deleteMutation.mutate(q.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
