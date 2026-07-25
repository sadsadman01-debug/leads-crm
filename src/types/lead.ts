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
  followup1_due_at?: string | null
  followup2_due_at?: string | null
  followup3_due_at?: string | null
  next_follow_up_due_at?: string | null
  is_overdue?: boolean
  is_due_today?: boolean
}

export type ScoreBand = 'Hot' | 'Warm' | 'Cold'

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
  stage_id: string | null
  industry_id: string | null
  score: number
  band: ScoreBand
  status?: LeadStatus
  tags: Tag[]
  social_profiles: SocialProfile[]
  attachments?: Attachment[]
}

export interface Industry {
  id: string
  name: string
}

export interface Template {
  id: string
  name: string
  subject: string
  body: string
  created_at: string
  updated_at: string
}

export interface LeadActivity {
  id: string
  type: string
  message: string
  created_at: string
}

export interface PipelineStage {
  id: string
  name: string
  position: number
}

export interface KanbanLead {
  id: string
  company_name: string
  priority: Priority
  stage_id: string | null
  score: number
  band: ScoreBand
  status: Pick<
    LeadStatus,
    | 'cold_email_sent'
    | 'followup1_sent'
    | 'followup2_sent'
    | 'followup3_sent'
    | 'whatsapp_sent'
    | 'linkedin_sent'
    | 'sms_sent'
    | 'replied'
    | 'converted'
    | 'next_follow_up_due_at'
    | 'is_overdue'
    | 'is_due_today'
  > | null
}

export interface AppSettings {
  follow_up_interval_days: number
  default_currency: string
}

export interface ReminderItem {
  id: string
  company_name: string
  priority: Priority
  due_at: string
  is_overdue: boolean
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
  industry_id: string
  tags: string[]
  social_profiles: SocialProfile[]
}

export const STATUS_TOGGLE_FIELDS: Array<{ field: keyof LeadStatus; label: string }> = [
  { field: 'cold_email_sent', label: 'Cold Email Sent' },
  { field: 'followup1_sent', label: '1st Follow-up Sent' },
  { field: 'followup2_sent', label: '2nd Follow-up Sent' },
  { field: 'followup3_sent', label: '3rd Follow-up Sent' },
  { field: 'replied', label: 'Replied' },
  { field: 'whatsapp_sent', label: 'WhatsApp Sent' },
  { field: 'no_whatsapp', label: 'No WhatsApp Available' },
  { field: 'email_invalid', label: 'Email Invalid' },
  { field: 'phone_invalid', label: 'Phone Invalid' },
  { field: 'converted', label: 'Converted to Client' },
  { field: 'linkedin_sent', label: 'LinkedIn Sent' },
  { field: 'sms_sent', label: 'SMS Sent' },
  { field: 'cold_call_made', label: 'Cold Call Made' },
]

export interface LeadFilters {
  priority?: Priority
  leadSource?: LeadSource
  tagIds?: string[]
  statusChecks?: Array<{ field: string; value: boolean }>
  dateFrom?: string
  dateTo?: string
  hasWebsite?: boolean
  hasSocialProfile?: boolean
  industryId?: string
}

export interface DashboardSummary {
  totals: { leads: number }
  outreach: Record<string, { count: number; pct: number }>
  replies: {
    total: number
    rate: number
    sentiment: Record<ReplySentiment, number>
  }
  conversion: { count: number; rate: number }
  funnel: Array<{ stage: string; count: number }>
  distributions: {
    leadSource: Array<{ label: string; count: number }>
    priority: Array<{ label: string; count: number }>
    status: Array<{ label: string; count: number }>
  }
  trend: {
    granularity: 'day' | 'week' | 'month'
    points: Array<{ date: string; leadsAdded: number; emailsSent: number }>
  }
  reminders: {
    overdueCount: number
    dueTodayCount: number
    items: ReminderItem[]
  }
  industryComparison: Array<{
    industryId: string | null
    industryName: string
    totalLeads: number
    coldEmailSentPct: number
    replyRate: number
    conversionRate: number
  }>
}
