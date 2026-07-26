export type MfaResetRequestStatus = 'pending' | 'resolved'
export type MfaResetTargetRole = 'admin' | 'user'

export interface MfaResetRequest {
  id: string
  target_profile_id: string
  target_email: string
  target_role: MfaResetTargetRole
  organization_id: string | null
  status: MfaResetRequestStatus
  requested_at: string
  resolved_at: string | null
  resolved_by: string | null
  target_nickname: string | null
  organization_name: string | null
}

export interface MfaResetResult {
  email: string
  nickname: string
}
