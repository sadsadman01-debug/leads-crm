import type { Role } from '@/types/team'

export interface ProductReview {
  id: string
  profile_id: string
  organization_id: string | null
  review_number: number
  rating: number
  comment: string | null
  suggestions: string | null
  submitted_at: string
  super_admin_reply: string | null
  replied_at: string | null
  replied_by: string | null
}

/** Only present on the Super Admin's platform-wide list (`listAll`). */
export interface ProductReviewWithReviewer extends ProductReview {
  reviewer_name: string
  reviewer_role: Role | null
  organization_name: string | null
}

export interface ProductReviewStats {
  average_all_time: number | null
  average_range: number | null
  total_reviews: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
}

export interface ProductReviewFilters {
  rating?: number
  organization_id?: string
  role?: 'admin' | 'user'
  reply_status?: 'replied' | 'not_replied' | 'all'
  date_from?: string
  date_to?: string
}
