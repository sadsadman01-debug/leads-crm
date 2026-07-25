import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { computeReminder } from '../lib/reminders.js'

const MAX_REMINDER_ITEMS = 50

const MAX_LEADS_FOR_AGGREGATION = 20000

const OUTREACH_FIELDS = [
  'cold_email_sent',
  'followup1_sent',
  'followup2_sent',
  'followup3_sent',
  'whatsapp_sent',
  'linkedin_sent',
  'sms_sent',
  'cold_call_made',
  'no_whatsapp',
  'email_invalid',
  'phone_invalid',
] as const

const SENTIMENTS = ['Positive', 'Neutral', 'Negative', 'Not Interested'] as const

type Granularity = 'day' | 'week' | 'month'

function pct(count: number, total: number): number {
  if (total === 0) return 0
  return Math.round((count / total) * 1000) / 10
}

/** Mirrors the status-summary classification used in the leads list table, so the
 * dashboard's "status distribution" chart matches what the list view shows. */
function classifyStatus(status: any): string {
  if (!status) return 'New'
  if (status.converted) return 'Converted'
  if (status.email_invalid || status.phone_invalid) return 'Invalid Contact'
  if (status.replied) return 'Replied'
  if (status.cold_email_sent || status.whatsapp_sent) return 'Outreach Sent'
  return 'New'
}

function bucketKey(date: Date, granularity: Granularity): string {
  if (granularity === 'month') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }
  if (granularity === 'week') {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    const dayOfWeek = d.getUTCDay()
    const diffToMonday = (dayOfWeek + 6) % 7
    d.setUTCDate(d.getUTCDate() - diffToMonday)
    return d.toISOString().slice(0, 10)
  }
  return date.toISOString().slice(0, 10)
}

function buildBucketRange(granularity: Granularity): string[] {
  const now = new Date()
  const keys: string[] = []

  if (granularity === 'month') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      keys.push(bucketKey(d, granularity))
    }
  } else if (granularity === 'week') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i * 7))
      keys.push(bucketKey(d, granularity))
    }
  } else {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
      keys.push(bucketKey(d, granularity))
    }
  }

  return [...new Set(keys)]
}

export async function getDashboardSummary(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const params = event.queryStringParameters ?? {}
  const granularity: Granularity = (['day', 'week', 'month'] as const).includes(params.granularity as Granularity)
    ? (params.granularity as Granularity)
    : 'day'

  const industryId = params.industryId || undefined

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, company_name, created_at, lead_source, priority, industry_id, lead_status(*)')
    .order('created_at', { ascending: true })
    .limit(MAX_LEADS_FOR_AGGREGATION)

  if (error) throw new HttpError(500, error.message)

  const allRows = leads ?? []
  const rows = industryId ? allRows.filter((r: any) => r.industry_id === industryId) : allRows
  const totalLeads = rows.length

  const statuses = rows.map((r: any) => (Array.isArray(r.lead_status) ? r.lead_status[0] : r.lead_status))

  const outreach: Record<string, { count: number; pct: number }> = {}
  for (const field of OUTREACH_FIELDS) {
    const count = statuses.filter((s: any) => s?.[field]).length
    outreach[field] = { count, pct: pct(count, totalLeads) }
  }

  const repliedStatuses = statuses.filter((s: any) => s?.replied)
  const sentimentBreakdown: Record<string, number> = {}
  for (const s of SENTIMENTS) sentimentBreakdown[s] = 0
  for (const s of repliedStatuses) {
    if (s?.reply_sentiment && s.reply_sentiment in sentimentBreakdown) {
      sentimentBreakdown[s.reply_sentiment]++
    }
  }

  const convertedCount = statuses.filter((s: any) => s?.converted).length

  const funnel = [
    { stage: 'Leads', count: totalLeads },
    { stage: 'Cold Email Sent', count: outreach.cold_email_sent.count },
    { stage: 'Followed Up', count: statuses.filter((s: any) => s?.followup1_sent || s?.followup2_sent || s?.followup3_sent).length },
    { stage: 'Replied', count: repliedStatuses.length },
    { stage: 'Converted', count: convertedCount },
  ]

  const leadSourceCounts = new Map<string, number>()
  const priorityCounts = new Map<string, number>()
  const statusDistCounts = new Map<string, number>()

  for (let i = 0; i < rows.length; i++) {
    const lead = rows[i] as any
    leadSourceCounts.set(lead.lead_source, (leadSourceCounts.get(lead.lead_source) ?? 0) + 1)
    priorityCounts.set(lead.priority, (priorityCounts.get(lead.priority) ?? 0) + 1)
    const label = classifyStatus(statuses[i])
    statusDistCounts.set(label, (statusDistCounts.get(label) ?? 0) + 1)
  }

  const toDist = (m: Map<string, number>) =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)

  const bucketKeys = buildBucketRange(granularity)
  const leadsAddedByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]))
  const emailsSentByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]))
  const bucketSet = new Set(bucketKeys)

  for (let i = 0; i < rows.length; i++) {
    const lead = rows[i] as any
    const createdKey = bucketKey(new Date(lead.created_at), granularity)
    if (bucketSet.has(createdKey)) {
      leadsAddedByBucket.set(createdKey, (leadsAddedByBucket.get(createdKey) ?? 0) + 1)
    }
    const sentAt = statuses[i]?.cold_email_sent_at
    if (sentAt) {
      const sentKey = bucketKey(new Date(sentAt), granularity)
      if (bucketSet.has(sentKey)) {
        emailsSentByBucket.set(sentKey, (emailsSentByBucket.get(sentKey) ?? 0) + 1)
      }
    }
  }

  const trend = {
    granularity,
    points: bucketKeys.map((key) => ({
      date: key,
      leadsAdded: leadsAddedByBucket.get(key) ?? 0,
      emailsSent: emailsSentByBucket.get(key) ?? 0,
    })),
  }

  const reminderItems = rows
    .map((lead: any, i: number) => ({ lead, reminder: computeReminder(statuses[i]) }))
    .filter((r) => r.reminder.is_overdue || r.reminder.is_due_today)
    .sort((a, b) => (a.reminder.next_follow_up_due_at! < b.reminder.next_follow_up_due_at! ? -1 : 1))
    .slice(0, MAX_REMINDER_ITEMS)
    .map(({ lead, reminder }) => ({
      id: lead.id,
      company_name: lead.company_name,
      priority: lead.priority,
      due_at: reminder.next_follow_up_due_at,
      is_overdue: reminder.is_overdue,
    }))

  const overdueCount = statuses.filter((s: any) => computeReminder(s).is_overdue).length
  const dueTodayCount = statuses.filter((s: any) => computeReminder(s).is_due_today).length

  const { data: industries } = await supabase.from('industries').select('id, name')
  const industryNameById = new Map((industries ?? []).map((i) => [i.id, i.name]))

  const byIndustry = new Map<string, any[]>()
  for (const lead of allRows as any[]) {
    const key = lead.industry_id ?? '__unassigned__'
    if (!byIndustry.has(key)) byIndustry.set(key, [])
    byIndustry.get(key)!.push(lead)
  }

  const industryComparison = [...byIndustry.entries()]
    .map(([key, industryLeads]) => {
      const industryStatuses = industryLeads.map((l: any) =>
        Array.isArray(l.lead_status) ? l.lead_status[0] : l.lead_status
      )
      const total = industryLeads.length
      const coldEmailCount = industryStatuses.filter((s: any) => s?.cold_email_sent).length
      const repliedCount = industryStatuses.filter((s: any) => s?.replied).length
      const convertedCount2 = industryStatuses.filter((s: any) => s?.converted).length

      return {
        industryId: key === '__unassigned__' ? null : key,
        industryName: key === '__unassigned__' ? 'Unassigned' : industryNameById.get(key) ?? 'Unknown',
        totalLeads: total,
        coldEmailSentPct: pct(coldEmailCount, total),
        replyRate: pct(repliedCount, total),
        conversionRate: pct(convertedCount2, total),
      }
    })
    .sort((a, b) => b.totalLeads - a.totalLeads)

  return json(200, {
    reminders: { overdueCount, dueTodayCount, items: reminderItems },
    totals: { leads: totalLeads },
    outreach,
    replies: {
      total: repliedStatuses.length,
      rate: pct(repliedStatuses.length, totalLeads),
      sentiment: sentimentBreakdown,
    },
    conversion: { count: convertedCount, rate: pct(convertedCount, totalLeads) },
    funnel,
    distributions: {
      leadSource: toDist(leadSourceCounts),
      priority: toDist(priorityCounts),
      status: toDist(statusDistCounts),
    },
    trend,
    industryComparison,
  })
}
