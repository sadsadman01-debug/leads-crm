export type PasswordResetRequestStatus = 'pending' | 'resolved'
export type PasswordResetTargetRole = 'admin' | 'user'

export interface PasswordResetRequest {
  id: string
  target_profile_id: string
  target_email: string
  target_role: PasswordResetTargetRole
  organization_id: string | null
  status: PasswordResetRequestStatus
  requested_at: string
  resolved_at: string | null
  resolved_by: string | null
  target_nickname: string | null
  organization_name: string | null
}

export interface PasswordResetResult {
  email: string
  nickname: string
  temporary_password: string
}
