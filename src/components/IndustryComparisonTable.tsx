import type { DashboardSummary } from '@/types/lead'

export function IndustryComparisonTable({ rows }: { rows: DashboardSummary['industryComparison'] }) {
  if (rows.length === 0) {
    return <div className="card p-6 text-sm text-base-400">No leads yet to compare across industries.</div>
  }

  const maxLeads = Math.max(1, ...rows.map((r) => r.totalLeads))

  return (
    <div className="card overflow-x-auto p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Industry Comparison</h2>
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
            <th className="py-2 pr-3 font-medium">Industry</th>
            <th className="px-3 py-2 font-medium">Leads</th>
            <th className="px-3 py-2 font-medium">Cold Email Sent</th>
            <th className="px-3 py-2 font-medium">Reply Rate</th>
            <th className="px-3 py-2 font-medium">Conversion Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.industryId ?? 'unassigned'} className="border-b border-base-800">
              <td className="py-3 pr-3 font-medium text-base-100">{row.industryName}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-base-800">
                    <div
                      className="h-full rounded-full bg-accent-500"
                      style={{ width: `${Math.round((row.totalLeads / maxLeads) * 100)}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-base-300">{row.totalLeads}</span>
                </div>
              </td>
              <td className="px-3 py-3 tabular-nums text-base-300">{row.coldEmailSentPct}%</td>
              <td className="px-3 py-3 tabular-nums text-base-300">{row.replyRate}%</td>
              <td className="px-3 py-3 tabular-nums text-base-300">{row.conversionRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
