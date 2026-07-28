export type SupportContactChannel = 'whatsapp' | 'email'

export interface SupportContact {
  id: string
  organization_id: string | null
  profile_id: string | null
  channel: SupportContactChannel
  message_preview: string | null
  created_at: string
  organization_name: string | null
  requester_nickname: string | null
  requester_email: string | null
}
