import { useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { formatCurrency } from '@/lib/currency'
import type { RevenueSummary } from '@/types/deal'

export function DealsClosingWidget({
  deals,
  displayCurrency,
}: {
  deals: RevenueSummary['dealsClosingThisMonth']
  displayCurrency?: string
}) {
  const navigate = useNavigate()
  const overdueCount = deals.filter((d) => d.is_overdue).length

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Deals Closing This Month</h2>
        {overdueCount > 0 && (
          <span className="pill bg-danger-bg text-danger">
            <AlertCircle size={12} />
            {overdueCount} overdue
          </span>
        )}
      </div>

      {deals.length === 0 ? (
        <p className="py-6 text-center text-sm text-base-400">No deals expected to close this month.</p>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto">
          {deals.map((deal) => (
            <li
              key={deal.id}
              onClick={() => navigate('/deals')}
              className="flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-base-850 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${deal.is_overdue ? 'bg-danger' : 'bg-warn'}`} />
                <span className="truncate text-sm text-base-100">{deal.name}</span>
                <span className="shrink-0 text-xs text-base-400">{deal.company_name}</span>
              </div>
              <span className="flex shrink-0 items-center gap-2 pl-4 text-xs sm:pl-0">
                <span className="font-semibold text-accent-400">{formatCurrency(Number(deal.value), deal.currency)}</span>
                {displayCurrency && deal.currency !== displayCurrency && (
                  <span
                    className="pill bg-base-800 text-base-400"
                    title={`Entered in ${deal.currency} — aggregate totals above are converted to ${displayCurrency}`}
                  >
                    {deal.currency}
                  </span>
                )}
                <span className={deal.is_overdue ? 'text-danger' : 'text-base-400'}>
                  {deal.is_overdue ? 'Overdue since ' : ''}
                  {format(parseISO(deal.expected_close_date), 'MMM d')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
