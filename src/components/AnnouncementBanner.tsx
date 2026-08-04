import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, X } from 'lucide-react'
import { announcementsApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type { AnnouncementListResponse } from '@/types/announcement'

/** Active announcements targeting the current viewer, rendered as dismissible
 * banners at the top of their Dashboard (or Affiliate Dashboard, for
 * audience = 'affiliates') — the entire delivery mechanism for Announcements
 * now, replacing the old Notification Center fan-out. Multiple simultaneously
 * active announcements simply stack, most recent first (per the backend's
 * ordering). Never rendered for the Super Admin — they author these, not
 * receive them — enforced both here (profile.role gate) and server-side
 * (getMyActiveAnnouncements always returns [] for a super_admin caller). */
export function AnnouncementBanner() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const enabled = Boolean(profile) && profile?.role !== 'super_admin'

  const { data } = useQuery({
    queryKey: ['my-active-announcements'],
    queryFn: announcementsApi.getMyActive,
    enabled,
  })
  const announcements = data?.announcements ?? []

  const dismissMutation = useMutation({
    mutationFn: (id: string) => announcementsApi.dismiss(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<AnnouncementListResponse>(['my-active-announcements'], (old) =>
        old ? { announcements: old.announcements.filter((a) => a.id !== id) } : old
      )
    },
  })

  if (!enabled || announcements.length === 0) return null

  return (
    <div className="space-y-3">
      {announcements.map((a) => (
        <div
          key={a.id}
          className="relative flex items-start gap-3 rounded-xl border border-accent-500/40 bg-accent-500/10 py-4 pl-5 pr-10 text-sm text-base-100"
        >
          <Megaphone size={22} className="mt-0.5 shrink-0 text-accent-400" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-base-100">{a.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-base-200">{a.message}</p>
          </div>
          <button
            className="absolute right-2 top-2 rounded-lg p-1 text-base-400 transition-colors hover:bg-black/10 hover:text-base-100"
            onClick={() => dismissMutation.mutate(a.id)}
            disabled={dismissMutation.isPending}
            aria-label="Dismiss announcement"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
