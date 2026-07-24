export type LeadSource = 'Google Maps' | 'Referral' | 'Manual Entry' | 'Website' | 'Other'
export type Priority = 'High' | 'Medium' | 'Low'
export type ReplySentiment = 'Positive' | 'Neutral' | 'Negative' | 'Not Interested'
export type ColdCallOutcome = 'No Answer' | 'Interested' | 'Not Interested' | 'Call Back Later'

export const LEAD_SOURCES: LeadSource[] = ['Google Maps', 'Referral', 'Manual Entry', 'Website', 'Other']
export const PRIORITIES: Priority[] = ['High', 'Medium', 'Low']
export const REPLY_SENTIMENTS: ReplySentiment[] = ['Positive', 'Neutral', 'Negative', 'Not Interested']
export const COLD_CALL_OUTCOMES: ColdCallOutcome[] = ['No Answer', 'Interested', 'Not Interested', 'Call Back Later']

export interface Tag {
  id: string
  name: string
}

export interface SocialProfile {
  id?: string
  platform: string
  url: string
}

export interface Attachment {
  id: string
  file_name: string
  storage_path: string
  content_type: string | null
  size_bytes: number | null
  uploaded_at: string
}

export interface LeadStatus {
  lead_id: string
  cold_email_sent: boolean
  cold_email_sent_at: string | null
  followup1_sent: boolean
  followup1_sent_at: string | null
  followup2_sent: boolean
  followup2_sent_at: string | null
  followup3_sent: boolean
  followup3_sent_at: string | null
  replied: boolean
  replied_at: string | null
  reply_sentiment: ReplySentiment | null
  whatsapp_sent: boolean
  whatsapp_sent_at: string | null
  no_whatsapp: boolean
  no_whatsapp_at: string | null
  email_invalid: boolean
  email_invalid_at: string | null
  phone_invalid: boolean
  phone_invalid_at: string | null
  converted: boolean
  converted_at: string | null
  linkedin_sent: boolean
  linkedin_sent_at: string | null
  sms_sent: boolean
  sms_sent_at: string | null
  cold_call_made: boolean
  cold_call_made_at: string | null
  cold_call_outcome: ColdCallOutcome | null
  updated_at: string
}

export interface Lead {
  id: string
  company_name: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  lead_source: LeadSource
  priority: Priority
  created_at: string
  updated_at: string
  status?: LeadStatus
  tags: Tag[]
  social_profiles: SocialProfile[]
  attachments?: Attachment[]
}

export interface LeadListResponse {
  leads: Lead[]
  page: number
  pageSize: number
  total: number
}

export interface LeadFormInput {
  company_name: string
  address: string
  phone: string
  email: string
  website: string
  notes: string
  lead_source: LeadSource
  priority: Priority
  tags: string[]
  social_profiles: SocialProfile[]
}
