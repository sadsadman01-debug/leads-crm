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

/** Non-sequence outreach state only — Cold-Contact + Follow-up completion
 * across Email/WhatsApp/LinkedIn is tracked per-Organization-configured stage
 * in `Lead.outreach_progress` instead (see OutreachSequenceStage below). */
export interface LeadStatus {
  lead_id: string
  replied: boolean
  replied_at: string | null
  reply_sentiment: ReplySentiment | null
  no_whatsapp: boolean
  no_whatsapp_at: string | null
  email_invalid: boolean
  email_invalid_at: string | null
  phone_invalid: boolean
  phone_invalid_at: string | null
  converted: boolean
  converted_at: string | null
  sms_sent: boolean
  sms_sent_at: string | null
  cold_call_made: boolean
  cold_call_made_at: string | null
  cold_call_outcome: ColdCallOutcome | null
  updated_at: string
  next_follow_up_due_at?: string | null
  is_overdue?: boolean
  is_due_today?: boolean
}

export type OutreachChannel = 'email' | 'whatsapp' | 'linkedin'

/** One row per (Organization, channel, stage_number) — the Admin-configured
 * outreach sequence. stage_number 0 is the initial contact stage (Cold
 * Email/WhatsApp Message/LinkedIn Message); 1+ are follow-ups. Deactivated
 * (removed) stages are never returned by the list endpoint — their history
 * on leads is preserved forever, just no longer offered for new toggling. */
export interface OutreachSequenceStage {
  id: string
  channel: OutreachChannel
  stage_number: number
  stage_label: string
  interval_days: number | null
  default_template_id: string | null
  display_order: number
  is_active: boolean
}

/** A lead's completion/due-date record against one configured stage. */
export interface LeadOutreachProgressEntry {
  outreach_sequence_stage_id: string
  channel: OutreachChannel
  stage_number: number
  stage_label: string
  completed_at: string | null
  due_date: string | null
}

export type ScoreBand = 'Hot' | 'Warm' | 'Cold'

export interface Lead {
  id: string
  company_name: string
  contact_name: string | null
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
  created_by: string | null
  assigned_to: string | null
  score: number
  band: ScoreBand
  status?: LeadStatus
  outreach_progress: LeadOutreachProgressEntry[]
  tags: Tag[]
  social_profiles: SocialProfile[]
  attachments?: Attachment[]
  custom_fields: Record<string, any>
}

export interface Industry {
  id: string
  name: string
}

export type TemplateType =
  | 'cold_email'
  | 'followup1'
  | 'followup2'
  | 'followup3'
  | 'whatsapp'
  | 'linkedin'
  | 'sms'
  | 'whatsapp_followup1'
  | 'whatsapp_followup2'
  | 'whatsapp_followup3'
  | 'linkedin_followup1'
  | 'linkedin_followup2'
  | 'linkedin_followup3'

export const TEMPLATE_TYPES: Array<{ value: TemplateType; label: string; hasSubject: boolean }> = [
  { value: 'cold_email', label: 'Cold Email', hasSubject: true },
  { value: 'followup1', label: 'Follow-up 1', hasSubject: true },
  { value: 'followup2', label: 'Follow-up 2', hasSubject: true },
  { value: 'followup3', label: 'Follow-up 3', hasSubject: true },
  { value: 'whatsapp', label: 'WhatsApp Message', hasSubject: false },
  { value: 'linkedin', label: 'LinkedIn Message', hasSubject: false },
  { value: 'sms', label: 'SMS', hasSubject: false },
  { value: 'whatsapp_followup1', label: 'WhatsApp Follow-up 1', hasSubject: false },
  { value: 'whatsapp_followup2', label: 'WhatsApp Follow-up 2', hasSubject: false },
  { value: 'whatsapp_followup3', label: 'WhatsApp Follow-up 3', hasSubject: false },
  { value: 'linkedin_followup1', label: 'LinkedIn Follow-up 1', hasSubject: false },
  { value: 'linkedin_followup2', label: 'LinkedIn Follow-up 2', hasSubject: false },
  { value: 'linkedin_followup3', label: 'LinkedIn Follow-up 3', hasSubject: false },
]

/** Maps a template type to the outreach channel its stage config lives under
 * — used to filter "this channel's templates" in the Outreach Sequences
 * settings screen and to drive the Lead Detail template auto-select. */
export const TEMPLATE_TYPE_CHANNEL: Partial<Record<TemplateType, OutreachChannel>> = {
  cold_email: 'email',
  followup1: 'email',
  followup2: 'email',
  followup3: 'email',
  whatsapp: 'whatsapp',
  whatsapp_followup1: 'whatsapp',
  whatsapp_followup2: 'whatsapp',
  whatsapp_followup3: 'whatsapp',
  linkedin: 'linkedin',
  linkedin_followup1: 'linkedin',
  linkedin_followup2: 'linkedin',
  linkedin_followup3: 'linkedin',
}

export interface Template {
  id: string
  name: string
  subject: string
  body: string
  template_type: TemplateType
  created_at: string
  updated_at: string
}

export interface LeadActivity {
  id: string
  type: string
  message: string
  created_at: string
  created_by: string | null
  actor_name: string | null
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
  assigned_to: string | null
  score: number
  band: ScoreBand
  outreach_completed_counts: Record<OutreachChannel, number>
  status: Pick<LeadStatus, 'replied' | 'converted' | 'next_follow_up_due_at' | 'is_overdue' | 'is_due_today'> | null
}

export interface AppSettings {
  default_currency: string
}

export interface ReminderItem {
  id: string
  company_name: string
  priority: Priority
  channel: OutreachChannel
  stageLabel: string
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
  contact_name: string
  address: string
  phone: string
  email: string
  website: string
  notes: string
  lead_source: LeadSource
  priority: Priority
  industry_id: string
  assigned_to: string
  tags: string[]
  social_profiles: SocialProfile[]
  custom_fields: Record<string, any>
}

/** The non-sequence toggles only — Cold-Contact/Follow-up completion is
 * rendered dynamically from the org's configured OutreachSequenceStage list
 * instead (see StatusPanel.tsx). */
export const STATUS_TOGGLE_FIELDS: Array<{ field: keyof LeadStatus; label: string }> = [
  { field: 'replied', label: 'Replied' },
  { field: 'no_whatsapp', label: 'No WhatsApp Available' },
  { field: 'email_invalid', label: 'Email Invalid' },
  { field: 'phone_invalid', label: 'Phone Invalid' },
  { field: 'converted', label: 'Converted to Client' },
  { field: 'sms_sent', label: 'SMS Sent' },
  { field: 'cold_call_made', label: 'Cold Call Made' },
]

export interface LeadFilters {
  priority?: Priority
  leadSource?: LeadSource
  tagIds?: string[]
  statusChecks?: Array<{ field: string; value: boolean }>
  /** A specific configured outreach-sequence stage id — "leads that have completed this stage". */
  outreachStageId?: string
  dateFrom?: string
  dateTo?: string
  hasWebsite?: boolean
  hasSocialProfile?: boolean
  industryId?: string
  assignedTo?: string
}

export interface TeamPerformanceRow {
  id: string
  name: string
  totalLeads: number
  coldEmailsSent: number
  replyRate: number
  conversionRate: number
  totalDeals: number
  dealsWon: number
  revenueClosed: number | null
  winRate: number
}

export interface DashboardOutreachStageStat {
  id: string
  channel: OutreachChannel
  stage_number: number
  stage_label: string
  count: number
  pct: number
}

export interface DashboardSummary {
  totals: { leads: number }
  outreach: Record<string, { count: number; pct: number }>
  outreachStages: DashboardOutreachStageStat[]
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
  teamPerformance?: TeamPerformanceRow[]
}
