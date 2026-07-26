import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { notificationsApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
}

export function NotificationBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: countData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: notificationsApi.unreadCount,
    enabled: Boolean(profile),
    refetchInterval: 45_000,
  })
  const unreadCount = countData?.count ?? 0

  const { data: listData, isLoading } = useQuery({
    queryKey: ['notifications-list', 'bell'],
    queryFn: () => notificationsApi.list({ pageSize: 10 }),
    enabled: open,
  })
  const notifications = listData?.notifications ?? []

  // Realtime, per spec's preferred approach — falls back to the 45s poll above
  // if the subscription ever silently drops.
  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_profile_id=eq.${profile.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
          queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id, queryClient])

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
    },
  })

  function handleItemClick(n: AppNotification) {
    if (!n.is_read) markReadMutation.mutate(n.id)
    setOpen(false)
    if (n.link_route) navigate(n.link_route)
  }

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost relative h-11 w-11 px-0"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed inset-x-0 top-14 bottom-0 z-50 flex flex-col overflow-hidden bg-base-900 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:bottom-auto sm:mt-2 sm:max-h-[70vh] sm:w-96 sm:rounded-xl sm:border sm:border-base-700/60 sm:shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-base-700/60 px-4 py-3">
              <span className="text-sm font-semibold text-base-100">Notifications</span>
              {unreadCount > 0 && (
                <button
                  className="flex items-center gap-1 text-xs font-medium text-accent-400 hover:underline"
                  disabled={markAllReadMutation.isPending}
                  onClick={() => markAllReadMutation.mutate()}
                >
                  <CheckCheck size={13} />
                  Mark all as read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="p-6 text-center text-sm text-base-400">Loading…</p>
              ) : notifications.length === 0 ? (
                <p className="p-8 text-center text-sm text-base-400">You're all caught up.</p>
              ) : (
                notifications.map((n) => {
                  const Icon = TYPE_ICON[n.type] ?? Bell
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleItemClick(n)}
                      className={`flex w-full items-start gap-3 border-b border-base-800 px-4 py-3 text-left transition-colors hover:bg-base-850 ${
                        n.is_read ? '' : 'bg-accent-500/[0.06]'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          n.is_read ? 'bg-base-800 text-base-400' : 'bg-accent-500/15 text-accent-400'
                        }`}
                      >
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-medium text-base-100">{n.title}</p>
                          {!n.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-base-400">{n.message}</p>
                        <p className="mt-1 text-xs text-base-500">{formatRelativeTime(n.created_at)}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            <button
              className="shrink-0 border-t border-base-700/60 px-4 py-3 text-center text-sm font-medium text-accent-400 hover:bg-base-850"
              onClick={() => {
                setOpen(false)
                navigate('/notifications')
              }}
            >
              View All
            </button>
          </div>
        </>
      )}
    </div>
  )
}
