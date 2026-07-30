import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { format, parseISO } from 'date-fns'
import { CHART_GRID, CHART_TEXT_MUTED } from '@/lib/chartColors'
import type { TrendPoint } from '@/types/affiliate'

function formatDateLabel(value: string) {
  try {
    return format(parseISO(value), 'MMM d')
  } catch {
    return value
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-xs shadow-soft">
      <p className="mb-1.5 text-base-400">{formatDateLabel(label)}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-0.5 w-3 shrink-0" style={{ backgroundColor: p.color }} />
          <span className="font-semibold tabular-nums text-base-100">{p.value}</span>
          <span className="text-base-400">{p.name}</span>
        </div>
      ))}
    </div>
  )
}

export function AffiliateTrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART_GRID} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateLabel}
          stroke={CHART_GRID}
          tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis stroke={CHART_GRID} tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: CHART_GRID, strokeWidth: 1 }} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: CHART_TEXT_MUTED }} />
        <Line type="monotone" dataKey="clicks" name="Link Clicks" stroke="#818cf8" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#111114' }} />
        <Line type="monotone" dataKey="requests" name="Signup Requests" stroke="#34d399" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#111114' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
