import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { computeReminder } from '../lib/reminders.js'
import { isAdminOrAbove, isSuperAdmin, hasFeaturePermission, resolveOrganizationId, scopeToOrg } from '../lib/permissions.js'
import { maybeCreateOverdueDigest, maybeNotifyDealDate } from '../lib/notifications.js'
import type { AuthedUser } from '../lib/auth.js'

const MAX_REMINDER_ITEMS = 50

const MAX_LEADS_FOR_AGGREGATION = 20000

/** Non-sequence outreach fields only — Cold-Contact/Follow-up completion
 * across Email/WhatsApp/LinkedIn is reported via the dynamic `outreachStages`
 * aggregation below instead, since stage count/labels are per-org configurable. */
const OUTREACH_FIELDS = ['sms_sent', 'cold_call_made', 'no_whatsapp', 'email_invalid', 'phone_invalid'] as const

const SENTIMENTS = ['Positive', 'Neutral', 'Negative', 'Not Interested'] as const

type Granularity = 'day' | 'week' | 'month'

function pct(count: number, total: number): number {
  if (total === 0) return 0
  return Math.round((count / total) * 1000) / 10
}

/** True if this lead has completed the given channel's initial-contact stage
 * (stage_number 0) — the dynamic-sequence equivalent of the old fixed
 * cold_email_sent/whatsapp_sent/linkedin_sent flags. */
function hasCompletedInitialTouch(progress: any[], channel: string): boolean {
  return progress.some(
    (p) => p.completed_at && p.outreach_sequence_stages?.is_active && p.outreach_sequence_stages?.channel === channel && p.outreach_sequence_stages?.stage_number === 0
  )
}

function initialTouchCompletedAt(progress: any[], channel: string): string | null {
  const row = progress.find(
    (p) => p.completed_at && p.outreach_sequence_stages?.is_active && p.outreach_sequence_stages?.channel === channel && p.outreach_sequence_stages?.stage_number === 0
  )
  return row?.completed_at ?? null
}

/** True if any channel has at least one completed follow-up stage (stage_number >= 1). */
function hasAnyFollowUpCompleted(progress: any[]): boolean {
  return progress.some((p) => p.completed_at && p.outreach_sequence_stages?.is_active && p.outreach_sequence_stages?.stage_number >= 1)
}

/** Mirrors the status-summary classification used in the leads list table, so the
 * dashboard's "status distribution" chart matches what the list view shows. */
function classifyStatus(status: any, progress: any[]): string {
  if (!status) return 'New'
  if (status.converted) return 'Converted'
  if (status.email_invalid || status.phone_invalid) return 'Invalid Contact'
  if (status.replied) return 'Replied'
  if (hasCompletedInitialTouch(progress, 'email') || hasCompletedInitialTouch(progress, 'whatsapp')) return 'Outreach Sent'
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

const OUTREACH_PROGRESS_SELECT = `
  lead_outreach_progress (
    outreach_sequence_stage_id, completed_at, due_date,
    outreach_sequence_stages ( channel, stage_number, stage_label, is_active )
  )
`

export async function getDashboardSummary(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const params = event.queryStringParameters ?? {}
  const granularity: Granularity = (['day', 'week', 'month'] as const).includes(params.granularity as Granularity)
    ? (params.granularity as Granularity)
    : 'day'

  const industryId = params.industryId || undefined
  // Users only ever see their own stats, regardless of what the client sends —
  // re-derived server-side so a User can't request someone else's numbers.
  const assignedTo = isAdminOrAbove(user) ? params.assignedTo || undefined : user.id

  let leadsQuery = supabase
    .from('leads')
    .select(`id, company_name, created_at, lead_source, priority, industry_id, assigned_to, lead_status(*), ${OUTREACH_PROGRESS_SELECT}`)
    .order('created_at', { ascending: true })
    .limit(MAX_LEADS_FOR_AGGREGATION)
  leadsQuery = scopeToOrg(leadsQuery as any, orgId) as any

  const { data: leads, error } = await leadsQuery

  if (error) throw new HttpError(500, error.message)

  const allRows = leads ?? []
  let rows = industryId ? allRows.filter((r: any) => r.industry_id === industryId) : allRows
  if (assignedTo) rows = rows.filter((r: any) => r.assigned_to === assignedTo)
  const totalLeads = rows.length

  const statuses = rows.map((r: any) => (Array.isArray(r.lead_status) ? r.lead_status[0] : r.lead_status))
  const progressRows = rows.map((r: any) => r.lead_outreach_progress ?? [])

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
  const coldEmailSentCount = progressRows.filter((p: any) => hasCompletedInitialTouch(p, 'email')).length

  const funnel = [
    { stage: 'Leads', count: totalLeads },
    { stage: 'Cold Email Sent', count: coldEmailSentCount },
    { stage: 'Followed Up', count: progressRows.filter((p: any) => hasAnyFollowUpCompleted(p)).length },
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
    const label = classifyStatus(statuses[i], progressRows[i])
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
    const sentAt = initialTouchCompletedAt(progressRows[i], 'email')
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
    .flatMap((lead: any, i: number) =>
      computeReminder(progressRows[i], statuses[i])
        .reminders.filter((r) => r.is_overdue || r.is_due_today)
        .map((r) => ({
          id: lead.id,
          company_name: lead.company_name,
          priority: lead.priority,
          channel: r.channel,
          stageLabel: r.stageLabel,
          due_at: r.due_at,
          is_overdue: r.is_overdue,
        }))
    )
    .sort((a, b) => (a.due_at < b.due_at ? -1 : 1))
    .slice(0, MAX_REMINDER_ITEMS)

  const overdueCount = rows.filter((_r: any, i: number) => computeReminder(progressRows[i], statuses[i]).is_overdue).length
  const dueTodayCount = rows.filter((_r: any, i: number) => computeReminder(progressRows[i], statuses[i]).is_due_today).length

  // --- Dynamic per-stage stat cards: one row per currently-active configured stage ---
  let stagesQuery = supabase
    .from('outreach_sequence_stages')
    .select('id, channel, stage_number, stage_label')
    .eq('is_active', true)
  stagesQuery = scopeToOrg(stagesQuery as any, orgId) as any
  const { data: activeStages, error: stagesErr } = await stagesQuery
  if (stagesErr) throw new HttpError(500, stagesErr.message)

  const completedCountByStage = new Map<string, number>()
  for (const progress of progressRows) {
    for (const p of progress) {
      if (p.completed_at && p.outreach_sequence_stages?.is_active) {
        completedCountByStage.set(p.outreach_sequence_stage_id, (completedCountByStage.get(p.outreach_sequence_stage_id) ?? 0) + 1)
      }
    }
  }
  const outreachStages = (activeStages ?? [])
    .map((s) => {
      const count = completedCountByStage.get(s.id) ?? 0
      return {
        id: s.id,
        channel: s.channel,
        stage_number: s.stage_number,
        stage_label: s.stage_label,
        count,
        pct: pct(count, totalLeads),
      }
    })
    .sort((a, b) => a.channel.localeCompare(b.channel) || a.stage_number - b.stage_number)

  // Lazily-triggered notification checks — no cron job exists in this app (same
  // "check on next request" pattern already used for exchange-rate refresh), so
  // these run inline on Dashboard load rather than on a schedule. Both are
  // internally deduped (at most one overdue digest per recipient per day; at
  // most one deal_closing_soon notification per deal ever), so repeated
  // Dashboard visits never spam duplicates. Super Admin visits (inspecting an
  // organization, or their own personal/sandbox scope) never generate these —
  // this is about the org's own Admin/User accountability, not the platform view.
  if (!isSuperAdmin(user) && orgId) {
    if (isAdminOrAbove(user)) {
      const orgOverdueCount = allRows.filter((r: any) => {
        const s = Array.isArray(r.lead_status) ? r.lead_status[0] : r.lead_status
        return computeReminder(r.lead_outreach_progress ?? [], s).is_overdue
      }).length
      await maybeCreateOverdueDigest({
        recipientId: user.id,
        organizationId: orgId,
        overdueCount: orgOverdueCount,
        scopeLabel: 'in your Organization',
        linkRoute: '/leads',
      })
    } else {
      const selfRows = allRows.filter((r: any) => r.assigned_to === user.id)
      const selfOverdueCount = selfRows.filter((r: any) => {
        const s = Array.isArray(r.lead_status) ? r.lead_status[0] : r.lead_status
        return computeReminder(r.lead_outreach_progress ?? [], s).is_overdue
      }).length
      await maybeCreateOverdueDigest({
        recipientId: user.id,
        organizationId: orgId,
        overdueCount: selfOverdueCount,
        scopeLabel: 'assigned to you',
        linkRoute: '/leads',
      })

      let myDealsQuery = supabase
        .from('deals')
        .select('id, name, expected_close_date, deal_stages(is_closed)')
        .eq('owner_id', user.id)
        .not('expected_close_date', 'is', null)
      myDealsQuery = scopeToOrg(myDealsQuery as any, orgId) as any
      const { data: myDeals } = await myDealsQuery

      const now = new Date()
      const soonThreshold = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      for (const d of (myDeals ?? []) as any[]) {
        if (d.deal_stages?.is_closed || !d.expected_close_date) continue
        const closeDate = new Date(d.expected_close_date)
        if (closeDate <= soonThreshold) {
          await maybeNotifyDealDate({
            recipientId: user.id,
            organizationId: orgId,
            dealId: d.id,
            dealName: d.name,
            isOverdue: closeDate < now,
          })
        }
      }
    }
  }

  let industriesQuery = supabase.from('industries').select('id, name')
  industriesQuery = scopeToOrg(industriesQuery as any, orgId) as any
  const { data: industries } = await industriesQuery
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
      const industryProgress = industryLeads.map((l: any) => l.lead_outreach_progress ?? [])
      const total = industryLeads.length
      const coldEmailCount = industryProgress.filter((p: any) => hasCompletedInitialTouch(p, 'email')).length
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

  let teamPerformance: any[] | undefined
  if (hasFeaturePermission(user, 'canViewTeamPerformance')) {
    const canViewValues = isAdminOrAbove(user) || user.permissions.canViewDealValues
    let membersQuery = supabase.from('profiles').select('id, nickname, email').eq('is_active', true)
    membersQuery = scopeToOrg(membersQuery as any, orgId) as any
    const { data: members } = await membersQuery

    let dealsQuery = supabase
      .from('deals')
      .select('owner_id, value, currency, stage_id, deal_stages(is_closed, is_won)')
      .limit(MAX_LEADS_FOR_AGGREGATION)
    dealsQuery = scopeToOrg(dealsQuery as any, orgId) as any
    const { data: deals } = await dealsQuery

    teamPerformance = (members ?? []).map((m) => {
      const memberLeads = allRows.filter((r: any) => r.assigned_to === m.id)
      const memberStatuses = memberLeads.map((l: any) => (Array.isArray(l.lead_status) ? l.lead_status[0] : l.lead_status))
      const memberProgress = memberLeads.map((l: any) => l.lead_outreach_progress ?? [])
      const coldEmailCount = memberProgress.filter((p: any) => hasCompletedInitialTouch(p, 'email')).length
      const repliedCount = memberStatuses.filter((s: any) => s?.replied).length
      const convertedCountMember = memberStatuses.filter((s: any) => s?.converted).length

      const memberDeals = (deals ?? []).filter((d: any) => d.owner_id === m.id)
      const wonDeals = memberDeals.filter((d: any) => d.deal_stages?.is_won)
      const closedDeals = memberDeals.filter((d: any) => d.deal_stages?.is_closed)
      const revenueClosed = wonDeals.reduce((sum: number, d: any) => sum + Number(d.value), 0)

      return {
        id: m.id,
        name: m.nickname || m.email,
        totalLeads: memberLeads.length,
        coldEmailsSent: coldEmailCount,
        replyRate: pct(repliedCount, memberLeads.length),
        conversionRate: pct(convertedCountMember, memberLeads.length),
        totalDeals: memberDeals.length,
        dealsWon: wonDeals.length,
        revenueClosed: canViewValues ? revenueClosed : null,
        winRate: pct(wonDeals.length, closedDeals.length),
      }
    })
  }

  return json(200, {
    reminders: { overdueCount, dueTodayCount, items: reminderItems },
    totals: { leads: totalLeads },
    outreach,
    outreachStages,
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
    teamPerformance,
  })
}
