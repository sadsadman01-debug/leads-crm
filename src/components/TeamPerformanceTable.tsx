import { formatCurrency } from '@/lib/currency'
import type { TeamPerformanceRow } from '@/types/lead'

export function TeamPerformanceTable({ rows, currency }: { rows: TeamPerformanceRow[]; currency: string }) {
  if (rows.length === 0) {
    return <div className="card p-6 text-sm text-base-400">No team members yet to compare.</div>
  }

  const maxLeads = Math.max(1, ...rows.map((r) => r.totalLeads))

  return (
    <div className="card overflow-x-auto p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-base-300">Team Performance</h2>
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-base-700/60 text-xs uppercase tracking-wide text-base-400">
            <th className="py-2 pr-3 font-medium">Member</th>
            <th className="px-3 py-2 font-medium">Leads</th>
            <th className="px-3 py-2 font-medium">Cold Emails</th>
            <th className="px-3 py-2 font-medium">Reply Rate</th>
            <th className="px-3 py-2 font-medium">Conversion Rate</th>
            <th className="px-3 py-2 font-medium">Deals</th>
            <th className="px-3 py-2 font-medium">Won</th>
            <th className="px-3 py-2 font-medium">Revenue Closed</th>
            <th className="px-3 py-2 font-medium">Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-base-800">
              <td className="py-3 pr-3 font-medium text-base-100">{row.name}</td>
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
              <td className="px-3 py-3 tabular-nums text-base-300">{row.coldEmailsSent}</td>
              <td className="px-3 py-3 tabular-nums text-base-300">{row.replyRate}%</td>
              <td className="px-3 py-3 tabular-nums text-base-300">{row.conversionRate}%</td>
              <td className="px-3 py-3 tabular-nums text-base-300">{row.totalDeals}</td>
              <td className="px-3 py-3 tabular-nums text-base-300">{row.dealsWon}</td>
              <td className="px-3 py-3 tabular-nums text-base-300">
                {row.revenueClosed === null ? '•••' : formatCurrency(row.revenueClosed, currency)}
              </td>
              <td className="px-3 py-3 tabular-nums text-base-300">{row.winRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
