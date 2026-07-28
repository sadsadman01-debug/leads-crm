export type SupportContactSource = 'in_app' | 'pre_auth'

export interface SupportContact {
  id: string
  organization_id: string | null
  profile_id: string | null
  message_preview: string | null
  created_at: string
  source: SupportContactSource
  organization_name: string | null
  requester_nickname: string | null
  requester_email: string | null
}
