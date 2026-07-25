import { useQuery } from '@tanstack/react-query'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { trendsApi } from '@/lib/api'
import type { PeriodComparison } from '@/lib/api'
import { formatCurrency } from '@/lib/currency'

function ChangeIndicator({ pctChange }: { pctChange: number | null }) {
  if (pctChange === null) return <span className="text-xs text-base-500">New</span>
  if (pctChange === 0) return (
    <span className="flex items-center gap-1 text-xs text-base-400">
      <Minus size={11} />0%
    </span>
  )
  const positive = pctChange > 0
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${positive ? 'text-success' : 'text-danger'}`}>
      {positive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(pctChange)}%
    </span>
  )
}

function ComparisonCard({ title, comparison, currency }: { title: string; comparison: PeriodComparison; currency: string }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-300">{title}</h3>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-base-400">Leads Added</span>
          <span className="flex items-center gap-2">
            <span className="font-semibold text-base-100">{comparison.leadsAdded.current}</span>
            <ChangeIndicator pctChange={comparison.leadsAdded.pctChange} />
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-base-400">Conversion Rate</span>
          <span className="flex items-center gap-2">
            <span className="font-semibold text-base-100">{comparison.conversionRate.current}%</span>
            <ChangeIndicator pctChange={comparison.conversionRate.pctChange} />
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-base-400">Revenue</span>
          <span className="flex items-center gap-2">
            <span className="font-semibold text-base-100">{formatCurrency(comparison.revenue.current, currency)}</span>
            <ChangeIndicator pctChange={comparison.revenue.pctChange} />
          </span>
        </div>
      </div>
    </div>
  )
}

export function DashboardPeriodComparisons({ currency }: { currency: string }) {
  const { data } = useQuery({
    queryKey: ['period-comparisons', currency],
    queryFn: () => trendsApi.periodComparisons(currency),
  })

  if (!data) return null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <ComparisonCard title="This Month vs Last Month" comparison={data.month} currency={currency} />
      <ComparisonCard title="This Quarter vs Last Quarter" comparison={data.quarter} currency={currency} />
      <ComparisonCard title="This Year vs Last Year" comparison={data.year} currency={currency} />
    </div>
  )
}
