export type NotificationType =
  | 'signup_request'
  | 'password_reset_request'
  | 'mfa_reset_request'
  | 'lead_assigned'
  | 'deal_assigned'
  | 'follow_up_overdue'
  | 'deal_closing_soon'
  | 'deal_closed_won'
  | 'deal_closed_lost'
  | 'affiliate_application'
  | 'withdrawal_request'
  | 'product_review_reply'
  | 'cancellation_request'
  | 'org_referral_reward'
  | 'announcement'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  link_route: string | null
  related_entity_id: string | null
  related_entity_type: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationListResponse {
  notifications: AppNotification[]
  page: number
  pageSize: number
  total: number
}
