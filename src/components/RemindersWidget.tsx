import { useNavigate } from 'react-router-dom'
import { AlertCircle, Clock, Mail, MessageCircle, Linkedin } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { PriorityBadge } from '@/components/ui/Badge'
import type { DashboardSummary, OutreachChannel } from '@/types/lead'

const CHANNEL_ICON: Record<OutreachChannel, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  linkedin: Linkedin,
}

export function RemindersWidget({ reminders }: { reminders: DashboardSummary['reminders'] }) {
  const navigate = useNavigate()
  const { overdueCount, dueTodayCount, items } = reminders

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-base-300">Follow-up Reminders</h2>
        <div className="flex flex-wrap gap-2">
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
          {items.map((item) => {
            const ChannelIcon = CHANNEL_ICON[item.channel]
            return (
              <li
                key={`${item.id}-${item.channel}-${item.stageLabel}`}
                onClick={() => navigate(`/leads/${item.id}`)}
                className="flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-base-850 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${item.is_overdue ? 'bg-danger' : 'bg-warn'}`}
                  />
                  <ChannelIcon size={13} className="shrink-0 text-base-400" />
                  <span className="truncate text-sm text-base-100">{item.company_name}</span>
                  <span className="shrink-0 text-xs text-base-500">{item.stageLabel}</span>
                  <PriorityBadge priority={item.priority} />
                </div>
                <span className={`shrink-0 pl-4 text-xs sm:pl-0 ${item.is_overdue ? 'text-danger' : 'text-warn'}`}>
                  {item.is_overdue ? 'Overdue since ' : 'Due '}
                  {format(parseISO(item.due_at), 'MMM d')}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
