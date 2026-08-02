import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  UserPlus2,
  KeyRound,
  Users,
  Handshake,
  Clock,
  CalendarClock,
  Trophy,
  XCircle,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MessageSquareText,
} from 'lucide-react'
import { notificationsApi } from '@/lib/api'
import { formatRelativeTime } from '@/lib/relativeTime'
import type { AppNotification, NotificationType } from '@/types/notification'

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  signup_request: UserPlus2,
  password_reset_request: KeyRound,
  lead_assigned: Users,
  deal_assigned: Handshake,
  follow_up_overdue: Clock,
  deal_closing_soon: CalendarClock,
  deal_closed_won: Trophy,
  deal_closed_lost: XCircle,
  product_review_reply: MessageSquareText,
}

const TYPE_LABELS: Array<{ value: NotificationType | ''; label: string }> = [
  { value: '', label: 'All Types' },
  { value: 'signup_request', label: 'Signup Requests' },
  { value: 'password_reset_request', label: 'Password Resets' },
  { value: 'lead_assigned', label: 'Lead Assigned' },
  { value: 'deal_assigned', label: 'Deal Assigned' },
  { value: 'follow_up_overdue', label: 'Follow-up Overdue' },
  { value: 'deal_closing_soon', label: 'Deal Closing Soon' },
  { value: 'deal_closed_won', label: 'Deal Closed Won' },
  { value: 'deal_closed_lost', label: 'Deal Closed Lost' },
]

type StatusFilter = 'all' | 'unread' | 'read'
const PAGE_SIZE = 20

export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [type, setType] = useState<NotificationType | ''>('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-list', status, type, page],
    queryFn: () => notificationsApi.list({ page, pageSize: PAGE_SIZE, status, type: type || undefined }),
    placeholderData: (prev) => prev,
  })

  const notifications = data?.notifications ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
  }

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: invalidate,
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: invalidate,
  })

  function handleItemClick(n: AppNotification) {
    if (!n.is_read) markReadMutation.mutate(n.id)
    if (n.link_route) navigate(n.link_route)
  }

  function updateStatus(next: StatusFilter) {
    setStatus(next)
    setPage(1)
  }

  function updateType(next: NotificationType | '') {
    setType(next)
    setPage(1)
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-100">Notifications</h1>
          <p className="mt-1 text-sm text-base-400">{total} total</p>
        </div>
        <button className="btn-secondary" disabled={markAllReadMutation.isPending} onClick={() => markAllReadMutation.mutate()}>
          <CheckCheck size={16} />
          Mark all as read
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-base-850 p-1 w-fit">
          {(['all', 'unread', 'read'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                status === s ? 'bg-accent-500 text-white' : 'text-base-300 hover:text-base-100'
              }`}
              onClick={() => updateStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <select className="input w-auto" value={type} onChange={(e) => updateType(e.target.value as NotificationType | '')}>
          {TYPE_LABELS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {isLoading && !data ? (
        <div className="card p-12 text-center text-base-400">Loading notifications…</div>
      ) : notifications.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-16 text-center">
          <Bell size={32} className="text-base-500" />
          <p className="text-base-300">No notifications here.</p>
        </div>
      ) : (
        <div className="card divide-y divide-base-800 overflow-hidden">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell
            return (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-base-850 ${
                  n.is_read ? '' : 'bg-accent-500/[0.06]'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    n.is_read ? 'bg-base-800 text-base-400' : 'bg-accent-500/15 text-accent-400'
                  }`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-base-100">{n.title}</p>
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
                  </div>
                  <p className="mt-0.5 text-sm text-base-400">{n.message}</p>
                  <p className="mt-1.5 text-xs text-base-500">{formatRelativeTime(n.created_at)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {total > 0 && (
        <div className="mt-4 flex flex-col gap-3 text-sm text-base-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={16} />
              Previous
            </button>
            <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
