import { useNavigate } from 'react-router-dom'
import { AlertCircle, Clock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { PriorityBadge } from '@/components/ui/Badge'
import type { DashboardSummary } from '@/types/lead'

export function RemindersWidget({ reminders }: { reminders: DashboardSummary['reminders'] }) {
  const navigate = useNavigate()
  const { overdueCount, dueTodayCount, items } = reminders

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Follow-up Reminders</h2>
        <div className="flex gap-2">
          {overdueCount > 0 && (
            <span className="pill bg-danger-bg text-danger">
              <AlertCircle size={12} />
              {overdueCount} overdue
            </span>
          )}
          {dueTodayCount > 0 && (
            <span className="pill bg-warn-bg text-warn">
              <Clock size={12} />
              {dueTodayCount} due today
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-base-400">Nothing needs action right now — nice work.</p>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.id}
              onClick={() => navigate(`/leads/${item.id}`)}
              className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-base-850"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${item.is_overdue ? 'bg-danger' : 'bg-warn'}`}
                />
                <span className="text-sm text-base-100">{item.company_name}</span>
                <PriorityBadge priority={item.priority} />
              </div>
              <span className={`text-xs ${item.is_overdue ? 'text-danger' : 'text-warn'}`}>
                {item.is_overdue ? 'Overdue since ' : 'Due '}
                {format(parseISO(item.due_at), 'MMM d')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
