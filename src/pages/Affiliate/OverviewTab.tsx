import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link2, DollarSign, CalendarClock, Wallet, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'
import { affiliatesApi } from '@/lib/api'
import { StatTile } from '@/components/charts/StatTile'
import { CopyButton } from '@/components/TempPasswordResult'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { AffiliateTrendChart } from './AffiliateTrendChart'

type RangeOption = 'all' | 'this_month' | 'last_30_days' | 'custom'

function computeRange(option: RangeOption, customFrom: string, customTo: string): { dateFrom?: string; dateTo?: string } {
  const now = new Date()
  if (option === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { dateFrom: from.toISOString(), dateTo: now.toISOString() }
  }
  if (option === 'last_30_days') {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return { dateFrom: from.toISOString(), dateTo: now.toISOString() }
  }
  if (option === 'custom' && customFrom && customTo) {
    return { dateFrom: new Date(customFrom).toISOString(), dateTo: new Date(`${customTo}T23:59:59.999`).toISOString() }
  }
  return {}
}

export function OverviewTab() {
  const [rangeOption, setRangeOption] = useState<RangeOption>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { dateFrom, dateTo } = useMemo(() => computeRange(rangeOption, customFrom, customTo), [rangeOption, customFrom, customTo])

  const { data } = useQuery({
    queryKey: ['affiliate-dashboard', dateFrom, dateTo],
    queryFn: () => affiliatesApi.getMyDashboard(dateFrom, dateTo),
  })

  if (!data) return <p className="text-sm text-base-400">Loading…</p>

  const { affiliate, balances, lastMonthEarned, funnel, trend } = data
  const referralLink = `${window.location.origin}/request-access?ref=${affiliate.referral_code}`

  const monthChangePct =
    lastMonthEarned > 0 ? Math.round(((balances.thisMonthEarned - lastMonthEarned) / lastMonthEarned) * 100) : balances.thisMonthEarned > 0 ? 100 : 0

  const funnelData = [
    { stage: 'Link Clicks', count: funnel.clicks },
    { stage: 'Signup Requests Submitted', count: funnel.requests },
    { stage: 'Signups Completed', count: funnel.completed },
  ]

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-400">Your Referral Link</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-base-850 px-3 py-2 text-sm text-base-200">
            <Link2 size={14} className="shrink-0 text-base-500" />
            <span className="truncate">{referralLink}</span>
          </div>
          <CopyButton text={referralLink} label="Copy Link" />
        </div>
        <p className="mt-2 text-xs text-base-500">
          Referral code: <span className="font-mono text-base-300">{affiliate.referral_code}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Total Lifetime Earned" value={`$${balances.lifetimeEarned}`} icon={DollarSign} tone="accent" />
        <StatTile
          label="This Month's Earnings"
          value={`$${balances.thisMonthEarned}`}
          subvalue={lastMonthEarned > 0 || balances.thisMonthEarned > 0 ? `${monthChangePct >= 0 ? '+' : ''}${monthChangePct}% vs last month` : undefined}
          icon={monthChangePct >= 0 ? TrendingUp : TrendingDown}
          tone={monthChangePct >= 0 ? 'success' : 'warn'}
        />
        <StatTile label="Available Balance" value={`$${balances.availableBalance}`} icon={Wallet} tone="success" />
        <StatTile label="Pending Withdrawal" value={`$${balances.pendingWithdrawal}`} icon={CalendarClock} tone="warn" />
        <StatTile label="Total Paid Out" value={`$${balances.totalPaidOut}`} icon={CheckCircle2} tone="neutral" />
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Conversion Funnel</h2>
          <div className="flex items-center gap-2">
            <select className="input w-auto py-1.5 text-xs" value={rangeOption} onChange={(e) => setRangeOption(e.target.value as RangeOption)}>
              <option value="all">All Time</option>
              <option value="this_month">This Month</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
            {rangeOption === 'custom' && (
              <>
                <input type="date" className="input w-auto py-1.5 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <input type="date" className="input w-auto py-1.5 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </>
            )}
          </div>
        </div>
        <FunnelChart data={funnelData} />
        <p className="mt-3 text-xs text-base-500">
          {funnel.clicks} clicks → {funnel.requests} requests ({funnel.clicks > 0 ? Math.round((funnel.requests / funnel.clicks) * 100) : 0}%) →{' '}
          {funnel.completed} completed ({funnel.requests > 0 ? Math.round((funnel.completed / funnel.requests) * 100) : 0}%)
        </p>
      </div>

      {rangeOption !== 'all' && trend.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Momentum</h2>
          <AffiliateTrendChart points={trend} />
        </div>
      )}
    </div>
  )
}
