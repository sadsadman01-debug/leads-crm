import { formatDistanceToNow } from 'date-fns'
import { DollarSign, TrendingUp, Trophy, XCircle, Percent, Ruler, Clock3 } from 'lucide-react'
import { StatTile } from '@/components/charts/StatTile'
import { DealFunnelChart } from '@/components/charts/DealFunnelChart'
import { RevenueTrendChart } from '@/components/charts/RevenueTrendChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { DealsClosingWidget } from '@/components/DealsClosingWidget'
import { formatCurrency } from '@/lib/currency'
import { CATEGORICAL_PALETTE } from '@/lib/chartColors'
import { CURRENCIES, currencyLabel, type RevenueSummary } from '@/types/deal'

const CLOSED_RANGES: Array<{ value: RevenueSummary['closedRange']; label: string }> = [
  { value: 'all', label: 'All Time' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
]

export function RevenueSection({
  revenue,
  closedRange,
  onClosedRangeChange,
  displayCurrency,
  onDisplayCurrencyChange,
}: {
  revenue: RevenueSummary
  closedRange: RevenueSummary['closedRange']
  onClosedRangeChange: (range: RevenueSummary['closedRange']) => void
  displayCurrency: string
  onDisplayCurrencyChange: (currency: string) => void
}) {
  const { totals } = revenue
  const currency = revenue.displayCurrency

  const lossReasonColors: Record<string, string> = {}
  revenue.lossReasonBreakdown.forEach((r, i) => {
    lossReasonColors[r.label] = CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-base-100">Revenue &amp; Pipeline</h2>
        <div className="flex flex-wrap gap-2">
          <select
            className="input w-full sm:w-auto"
            value={displayCurrency}
            onChange={(e) => onDisplayCurrencyChange(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>Display: {currencyLabel(c)}</option>
            ))}
          </select>
          <select
            className="input w-full sm:w-auto"
            value={closedRange}
            onChange={(e) => onClosedRangeChange(e.target.value as RevenueSummary['closedRange'])}
          >
            {CLOSED_RANGES.map((r) => (
              <option key={r.value} value={r.value}>Closed Won: {r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-base-500">
        Rates updated {formatDistanceToNow(new Date(revenue.ratesUpdatedAt), { addSuffix: true })} — figures below are
        converted into {currency} for comparison; each deal always keeps its own original currency.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <StatTile
          label="Open Pipeline Value"
          value={formatCurrency(totals.openPipelineValue, currency)}
          subvalue={`${totals.openDealsCount} open`}
          icon={DollarSign}
          tone="accent"
        />
        <StatTile
          label="Weighted Pipeline"
          value={formatCurrency(totals.weightedPipelineValue, currency)}
          subvalue="forecasted"
          icon={TrendingUp}
          tone="accent"
        />
        <StatTile
          label="Closed Won Revenue"
          value={formatCurrency(totals.closedWonRevenue, currency)}
          subvalue={`${totals.closedWonCount} won`}
          icon={Trophy}
          tone="success"
        />
        <StatTile
          label="Closed Lost Value"
          value={formatCurrency(totals.closedLostValue, currency)}
          subvalue={`${totals.closedLostCount} lost`}
          icon={XCircle}
          tone="danger"
        />
        <StatTile label="Win Rate" value={`${totals.winRate}%`} icon={Percent} tone="accent" />
        <StatTile label="Avg Deal Size" value={formatCurrency(totals.avgDealSize, currency)} icon={Ruler} tone="neutral" />
        <StatTile label="Avg Sales Cycle" value={`${totals.avgSalesCycleDays}d`} icon={Clock3} tone="neutral" />
      </div>

      <DealsClosingWidget deals={revenue.dealsClosingThisMonth} displayCurrency={currency} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Pipeline Funnel</h3>
          <DealFunnelChart data={revenue.funnel} currency={currency} />
        </div>
        <div className="card p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Loss Reasons</h3>
          {revenue.lossReasonBreakdown.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-base-400">No lost deals yet</div>
          ) : (
            <DonutChart data={revenue.lossReasonBreakdown} colors={lossReasonColors} />
          )}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Closed Won Revenue (12mo)</h3>
        <RevenueTrendChart points={revenue.trend} currency={currency} />
      </div>

      <p className="text-center text-xs text-base-600">
        Exchange rates by{' '}
        <a
          href="https://www.exchangerate-api.com"
          target="_blank"
          rel="noreferrer"
          className="text-base-500 underline hover:text-base-400"
        >
          ExchangeRate-API
        </a>
      </p>
    </div>
  )
}
