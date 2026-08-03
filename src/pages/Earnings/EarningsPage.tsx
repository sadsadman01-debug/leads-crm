import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CircleDollarSign,
  TrendingUp,
  Wallet,
  Building2,
  Percent,
  Tag,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { earningsApi } from '@/lib/api'
import { StatTile } from '@/components/charts/StatTile'
import { EarningsTrendChart } from '@/components/charts/EarningsTrendChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { PAYMENT_METHOD_COLORS } from '@/lib/chartColors'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '@/types/billing'
import type { EarningsGranularity, EarningsTierBucket, EarningsTransactionFilters } from '@/types/earnings'

const GRANULARITIES: Array<{ value: EarningsGranularity; label: string }> = [
  { value: 'day', label: 'Daily (30d)' },
  { value: 'week', label: 'Weekly (12w)' },
  { value: 'month', label: 'Monthly (12mo)' },
]

const TIER_LABELS: Record<EarningsTierBucket, string> = {
  early_bird: 'Early Bird',
  standard: 'Standard',
  annual: 'Annual Billing',
}

function fmtTaka(n: number): string {
  return `৳${Math.round(n).toLocaleString()}`
}

const PAGE_SIZE = 25

export function EarningsPage() {
  const [granularity, setGranularity] = useState<EarningsGranularity>('day')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { data: summary, isLoading: summaryLoading } = useQuery({ queryKey: ['earnings-summary'], queryFn: earningsApi.getSummary })

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['earnings-trend', granularity, customFrom, customTo],
    queryFn: () => earningsApi.getTrend(granularity, customFrom || undefined, customTo || undefined),
    placeholderData: (prev) => prev,
  })

  // Payment Method + Tier breakdowns reuse the trend's resolved range, so
  // "the currently selected date range" stays a single source of truth
  // instead of three independently-drifting date pickers.
  const rangeFrom = trend?.dateFrom
  const rangeTo = trend?.dateTo

  const { data: byMethod } = useQuery({
    queryKey: ['earnings-by-payment-method', rangeFrom, rangeTo],
    queryFn: () => earningsApi.getByPaymentMethod(rangeFrom, rangeTo),
    enabled: Boolean(rangeFrom && rangeTo),
  })

  const { data: byTier } = useQuery({
    queryKey: ['earnings-by-tier', rangeFrom, rangeTo],
    queryFn: () => earningsApi.getByTier(rangeFrom, rangeTo),
    enabled: Boolean(rangeFrom && rangeTo),
  })

  const { data: promoPerformance } = useQuery({ queryKey: ['earnings-promo-performance'], queryFn: earningsApi.getPromoPerformance })

  // Transaction log — its own independent filter set (spec: date range,
  // payment method, pricing tier, search), not tied to the range above.
  const [txDateFrom, setTxDateFrom] = useState('')
  const [txDateTo, setTxDateTo] = useState('')
  const [txPaymentMethod, setTxPaymentMethod] = useState('')
  const [txPricingTier, setTxPricingTier] = useState<EarningsTierBucket | ''>('')
  const [txSearch, setTxSearch] = useState('')
  const [txPage, setTxPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const txFilters: EarningsTransactionFilters = useMemo(
    () => ({
      dateFrom: txDateFrom || undefined,
      dateTo: txDateTo || undefined,
      paymentMethod: txPaymentMethod || undefined,
      pricingTier: txPricingTier || undefined,
      search: txSearch.trim() || undefined,
    }),
    [txDateFrom, txDateTo, txPaymentMethod, txPricingTier, txSearch]
  )

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['earnings-transactions', txFilters, txPage],
    queryFn: () => earningsApi.listTransactions(txFilters, txPage, PAGE_SIZE),
    placeholderData: (prev) => prev,
  })
  const transactions = txData?.transactions ?? []
  const txTotal = txData?.total ?? 0
  const txTotalPages = Math.max(1, Math.ceil(txTotal / PAGE_SIZE))

  async function handleExport() {
    setExporting(true)
    try {
      await earningsApi.downloadTransactionsCsv(txFilters)
    } finally {
      setExporting(false)
    }
  }

  const donutData = (byMethod?.breakdown ?? []).map((row) => ({
    label: PAYMENT_METHOD_LABELS[row.payment_method as PaymentMethod] ?? 'Unspecified',
    count: row.revenue,
  }))
  const donutColors: Record<string, string> = Object.fromEntries(
    (byMethod?.breakdown ?? []).map((row) => [
      PAYMENT_METHOD_LABELS[row.payment_method as PaymentMethod] ?? 'Unspecified',
      PAYMENT_METHOD_COLORS[row.payment_method] ?? '#4a4b56',
    ])
  )

  const maxTierRevenue = Math.max(1, ...(byTier?.breakdown ?? []).map((r) => r.revenue))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-base-100">Earnings</h1>
        <p className="mt-1 text-sm text-base-400">
          Your own business earnings from selling Leadify subscriptions — never any Organization's leads, deals, or pipeline data.
        </p>
      </div>

      {summaryLoading || !summary ? (
        <div className="card p-12 text-center text-base-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 desktop:grid-cols-4">
          <StatTile label="Total Gross Revenue" value={fmtTaka(summary.gross_all_time)} icon={CircleDollarSign} tone="accent" />
          <StatTile label="Total Net Revenue" value={fmtTaka(summary.net_all_time)} subvalue="after affiliate commissions" icon={TrendingUp} tone="success" />
          <StatTile
            label="This Month"
            value={fmtTaka(summary.this_month.gross)}
            subvalue={`net ${fmtTaka(summary.this_month.net)}`}
            icon={CircleDollarSign}
            tone="neutral"
          />
          <StatTile
            label="This Week"
            value={fmtTaka(summary.this_week.gross)}
            subvalue={`net ${fmtTaka(summary.this_week.net)}`}
            icon={CircleDollarSign}
            tone="neutral"
          />
          <StatTile
            label="Today"
            value={fmtTaka(summary.today.gross)}
            subvalue={`net ${fmtTaka(summary.today.net)}`}
            icon={CircleDollarSign}
            tone="neutral"
          />
          <StatTile label="Active Paying Organizations" value={summary.active_paying_organizations} icon={Building2} tone="accent" />
          <StatTile label="Avg Revenue / Organization" value={fmtTaka(summary.avg_revenue_per_organization)} icon={Wallet} tone="neutral" />
          <StatTile label="Total Discounts Given" value={fmtTaka(summary.total_discounts_given)} subvalue="via promo codes" icon={Percent} tone="warn" />
        </div>
      )}

      <div className="card p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Revenue Trend — Gross vs Net</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-full sm:w-auto"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as EarningsGranularity)}
            >
              {GRANULARITIES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            <input type="date" className="input w-full sm:w-auto" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" className="input w-full sm:w-auto" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        </div>
        {trendLoading || !trend ? (
          <div className="p-12 text-center text-base-400">Loading…</div>
        ) : (
          <EarningsTrendChart points={trend.points} granularity={trend.granularity} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Revenue by Payment Method</h2>
          <DonutChart data={donutData} colors={donutColors} />
        </div>
        <div className="card overflow-x-auto p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Payment Method Detail</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Revenue</th>
                <th className="px-3 py-2 font-medium">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {(byMethod?.breakdown ?? []).map((row) => (
                <tr key={row.payment_method} className="border-b border-base-800">
                  <td className="py-3 pr-3 text-base-100">{PAYMENT_METHOD_LABELS[row.payment_method as PaymentMethod] ?? 'Unspecified'}</td>
                  <td className="px-3 py-3 tabular-nums text-base-200">{fmtTaka(row.revenue)}</td>
                  <td className="px-3 py-3 tabular-nums text-base-400">{row.count}</td>
                </tr>
              ))}
              {(!byMethod || byMethod.breakdown.length === 0) && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-base-500">No payments in this range yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-x-auto p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Revenue by Pricing Tier / Billing Cycle</h2>
        <div className="space-y-3">
          {(byTier?.breakdown ?? []).map((row) => (
            <div key={row.tier} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0 text-sm text-base-300 sm:w-32">{row.label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-base-800">
                <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.round((row.revenue / maxTierRevenue) * 100)}%` }} />
              </div>
              <div className="flex justify-between gap-3 sm:contents">
                <span className="shrink-0 text-right tabular-nums text-base-200 sm:w-28">{fmtTaka(row.revenue)}</span>
                <span className="shrink-0 text-right tabular-nums text-base-500 sm:w-20">{row.count} txns</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-300">Promo Code Performance</h2>
        <p className="mb-4 text-xs text-base-500">All-time — evaluates whether a campaign was worthwhile beyond just its up-front discount cost.</p>
        {(promoPerformance?.promo_codes.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-base-500">No promo codes have been used yet.</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Times Used</th>
                <th className="px-3 py-2 font-medium">Total Discount Given</th>
                <th className="px-3 py-2 font-medium">Total Revenue Collected</th>
              </tr>
            </thead>
            <tbody>
              {(promoPerformance?.promo_codes ?? []).map((row) => (
                <tr key={row.code} className="border-b border-base-800">
                  <td className="py-3 pr-3 font-mono font-medium text-base-100">{row.code}</td>
                  <td className="px-3 py-3 tabular-nums text-base-300">{row.times_used}</td>
                  <td className="px-3 py-3 tabular-nums text-warn">−{fmtTaka(row.total_discount_given)}</td>
                  <td className="px-3 py-3 tabular-nums text-success">{fmtTaka(row.total_revenue_collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto p-6">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Detailed Transaction Log</h2>
            <button className="btn-secondary" disabled={exporting} onClick={handleExport}>
              <Download size={15} />
              {exporting ? 'Exporting…' : 'Export as CSV'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-500" />
              <input
                className="input pl-9"
                placeholder="Search organization…"
                value={txSearch}
                onChange={(e) => {
                  setTxPage(1)
                  setTxSearch(e.target.value)
                }}
              />
            </div>
            <input
              type="date"
              className="input w-auto"
              value={txDateFrom}
              onChange={(e) => {
                setTxPage(1)
                setTxDateFrom(e.target.value)
              }}
            />
            <input
              type="date"
              className="input w-auto"
              value={txDateTo}
              onChange={(e) => {
                setTxPage(1)
                setTxDateTo(e.target.value)
              }}
            />
            <select
              className="input w-auto"
              value={txPaymentMethod}
              onChange={(e) => {
                setTxPage(1)
                setTxPaymentMethod(e.target.value)
              }}
            >
              <option value="">All Payment Methods</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={txPricingTier}
              onChange={(e) => {
                setTxPage(1)
                setTxPricingTier(e.target.value as EarningsTierBucket | '')
              }}
            >
              <option value="">All Tiers</option>
              <option value="early_bird">Early Bird</option>
              <option value="standard">Standard</option>
              <option value="annual">Annual Billing</option>
            </select>
          </div>
        </div>

        {txLoading && !txData ? (
          <div className="p-12 text-center text-base-400">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-16 text-center">
            <Tag size={32} className="text-base-500" />
            <p className="text-base-300">No matching transactions.</p>
          </div>
        ) : (
          <>
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Organization</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Payment Method</th>
                  <th className="px-3 py-2 font-medium">Promo Code</th>
                  <th className="px-3 py-2 font-medium">Discount</th>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium">Cycle</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-base-800">
                    <td className="py-3 pr-3 text-base-400">{new Date(tx.paid_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3 font-medium text-base-100">{tx.organization_name}</td>
                    <td className="px-3 py-3 tabular-nums text-base-200">{fmtTaka(tx.amount)}</td>
                    <td className="px-3 py-3 text-base-300">{tx.payment_method ? PAYMENT_METHOD_LABELS[tx.payment_method] : '—'}</td>
                    <td className="px-3 py-3 font-mono text-base-300">{tx.promo_code_text ?? '—'}</td>
                    <td className="px-3 py-3 tabular-nums text-base-400">{tx.discount_amount > 0 ? `−${fmtTaka(tx.discount_amount)}` : '—'}</td>
                    <td className="px-3 py-3 text-base-300 capitalize">{tx.pricing_tier?.replace('_', ' ') ?? '—'}</td>
                    <td className="px-3 py-3 text-base-300 capitalize">{tx.billing_cycle ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-sm text-base-400">
              <span>
                Page {txPage} of {txTotalPages} · {txTotal} transactions
              </span>
              <div className="flex gap-2">
                <button className="btn-secondary px-2" disabled={txPage <= 1} onClick={() => setTxPage((p) => p - 1)}>
                  <ChevronLeft size={15} />
                </button>
                <button className="btn-secondary px-2" disabled={txPage >= txTotalPages} onClick={() => setTxPage((p) => p + 1)}>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
