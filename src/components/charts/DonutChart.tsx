import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CHART_TEXT_MUTED } from '@/lib/chartColors'

interface Slice {
  label: string
  count: number
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-base-600 bg-base-850 px-3 py-2 text-xs shadow-soft">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.payload.fill }} />
        <span className="font-semibold tabular-nums text-base-100">{p.value}</span>
        <span className="text-base-400">{p.name}</span>
      </div>
    </div>
  )
}

export function DonutChart({
  data,
  colors,
  fallbackColor = '#4a4b56',
}: {
  data: Slice[]
  colors: Record<string, string>
  fallbackColor?: string
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const showDirectLabels = data.length <= 4

  if (total === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-base-400">No data yet</div>
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius="58%"
            outerRadius="85%"
            paddingAngle={2}
            cornerRadius={3}
            strokeWidth={0}
            label={
              showDirectLabels
                ? ({ percent }) => (percent > 0.05 ? `${Math.round(percent * 100)}%` : '')
                : false
            }
            labelLine={false}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={colors[d.label] ?? fallbackColor} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: CHART_TEXT_MUTED }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="text-xl font-semibold text-base-100">{total.toLocaleString()}</div>
        <div className="text-[10px] uppercase tracking-wide text-base-400">Total</div>
      </div>
    </div>
  )
}
