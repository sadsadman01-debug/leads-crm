export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'signup_request_submitted'
  | 'signup_request_approved'
  | 'signup_request_rejected'
  | 'admin_account_created'
  | 'user_account_created'
  | 'team_member_deactivated'
  | 'team_member_reactivated'
  | 'team_member_deleted'
  | 'permissions_changed'
  | 'password_reset_request_submitted'
  | 'password_reset_request_resolved'
  | 'mfa_reset_request_submitted'
  | 'mfa_reset_request_resolved'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'organization_created'
  | 'organization_suspended'
  | 'organization_reactivated'
  | 'organization_deleted'
  | 'organization_branding_changed'
  | 'platform_branding_changed'
  | 'data_export_triggered'
  | 'bulk_leads_deleted'
  | 'leads_merged'
  | 'deals_merged'
  | 'payment_recorded'
  | 'payment_status_changed'
  | 'subscription_expired'
  | 'affiliate_application_submitted'
  | 'affiliate_approved'
  | 'affiliate_rejected'
  | 'affiliate_commission_generated'
  | 'withdrawal_requested'
  | 'withdrawal_status_changed'

export interface AuditLogEntry {
  id: string
  event_type: AuditEventType
  actor_profile_id: string | null
  actor_role: 'super_admin' | 'admin' | 'user' | 'affiliate' | null
  actor_nickname: string | null
  organization_id: string | null
  organization_name: string | null
  target_profile_id: string | null
  target_nickname: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface AuditLogListResponse {
  entries: AuditLogEntry[]
  total: number
}

export interface AuditLogFilters {
  eventTypes?: AuditEventType[]
  organizationId?: string
  actorProfileId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  login_success: 'Login succeeded',
  login_failure: 'Login failed',
  logout: 'Logout',
  signup_request_submitted: 'Signup request submitted',
  signup_request_approved: 'Signup request approved',
  signup_request_rejected: 'Signup request rejected',
  admin_account_created: 'Admin account created',
  user_account_created: 'User account created',
  team_member_deactivated: 'Team member deactivated',
  team_member_reactivated: 'Team member reactivated',
  team_member_deleted: 'Team member deleted',
  permissions_changed: 'Permissions changed',
  password_reset_request_submitted: 'Password reset requested',
  password_reset_request_resolved: 'Password reset resolved',
  mfa_reset_request_submitted: 'MFA reset requested',
  mfa_reset_request_resolved: 'MFA reset resolved',
  mfa_enabled: 'Two-factor authentication enabled',
  mfa_disabled: 'Two-factor authentication disabled',
  organization_created: 'Organization created',
  organization_suspended: 'Organization suspended',
  organization_reactivated: 'Organization reactivated',
  organization_deleted: 'Organization deleted',
  organization_branding_changed: 'Organization branding changed',
  platform_branding_changed: 'Platform branding changed',
  data_export_triggered: 'Data export triggered',
  bulk_leads_deleted: 'Bulk leads deleted',
  leads_merged: 'Leads merged',
  deals_merged: 'Deals merged',
  payment_recorded: 'Payment recorded',
  payment_status_changed: 'Payment status changed',
  subscription_expired: 'Subscription expired (access blocked)',
  affiliate_application_submitted: 'Affiliate application submitted',
  affiliate_approved: 'Affiliate approved',
  affiliate_rejected: 'Affiliate application rejected',
  affiliate_commission_generated: 'Affiliate commission generated',
  withdrawal_requested: 'Withdrawal requested',
  withdrawal_status_changed: 'Withdrawal status changed',
}

/** Security-relevant events get one color family in the UI; every other
 * event type is "administrative" and gets a different one. */
export const SECURITY_EVENT_TYPES: AuditEventType[] = [
  'login_success',
  'login_failure',
  'logout',
  'password_reset_request_submitted',
  'password_reset_request_resolved',
  'mfa_reset_request_submitted',
  'mfa_reset_request_resolved',
  'mfa_enabled',
  'mfa_disabled',
]

export function isSecurityEvent(eventType: AuditEventType): boolean {
  return SECURITY_EVENT_TYPES.includes(eventType)
}
