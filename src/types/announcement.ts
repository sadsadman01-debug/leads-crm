export type AnnouncementAudience = 'all' | 'admins_only' | 'specific_organizations' | 'affiliates'

export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'All Organizations',
  admins_only: 'Admins Only',
  specific_organizations: 'Specific Organizations',
  affiliates: 'All Affiliates',
}

export interface Announcement {
  id: string
  title: string
  message: string
  audience: AnnouncementAudience
  target_organization_ids: string[] | null
  created_by: string | null
  created_at: string
  is_active: boolean
}

export interface AnnouncementListResponse {
  announcements: Announcement[]
}
