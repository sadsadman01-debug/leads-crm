export type CancellationRequestStatus = 'pending' | 'acknowledged'

export const CANCELLATION_REASONS = [
  'Too expensive',
  'Not using it enough',
  'Missing features',
  'Switching to another tool',
  'Other',
] as const

export interface CancellationRequest {
  id: string
  organization_id: string
  organization_name: string
  requested_by: string | null
  requested_by_name: string | null
  reason: string
  additional_comments: string | null
  requested_at: string
  status: CancellationRequestStatus
  resolved_at: string | null
  resolved_by: string | null
}
