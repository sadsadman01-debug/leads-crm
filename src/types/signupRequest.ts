export type SignupRequestStatus = 'pending' | 'approved' | 'rejected'

export interface SignupRequest {
  id: string
  organization_name: string
  contact_name: string
  email: string
  phone: string | null
  message: string | null
  status: SignupRequestStatus
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
}

export interface ApproveSignupRequestResult {
  request: SignupRequest
  organization: { id: string; name: string }
  admin: { email: string; nickname: string; temporary_password: string }
}
