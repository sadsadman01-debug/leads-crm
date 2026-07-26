import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { format, parseISO } from 'date-fns'
import { CATEGORICAL_PALETTE, CHART_GRID, CHART_TEXT_MUTED } from '@/lib/chartColors'
import { formatCurrency } from '@/lib/currency'

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-xs shadow-soft">
      <p className="mb-1 text-base-400">{format(parseISO(`${label}-01`), 'MMM yyyy')}</p>
      <span className="font-semibold tabular-nums text-base-100">{formatCurrency(payload[0].value, currency)}</span>
    </div>
  )
}

export function RevenueTrendChart({ points, currency }: { points: Array<{ month: string; revenue: number | null }>; currency: string }) {
  const data = points.map((p) => ({ ...p, revenue: p.revenue ?? 0 }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART_GRID} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(v) => format(parseISO(`${v}-01`), 'MMM')}
          stroke={CHART_GRID}
          tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          minTickGap={16}
        />
        <YAxis
          stroke={CHART_GRID}
          tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="revenue" name="Closed Won Revenue" fill={CATEGORICAL_PALETTE[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
