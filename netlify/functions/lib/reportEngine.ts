import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'
import { scopeToOrg } from './permissions.js'
import { getOrRefreshRates, convertAmount } from './exchangeRates.js'

export type ReportType = 'leads' | 'deals' | 'activity'

export interface ReportFilters {
  dateFrom?: string
  dateTo?: string
  priority?: string
  industryId?: string
  assignedTo?: string
  stageId?: string
  customFields?: Record<string, any>
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function matchesCustomFieldFilters(record: Record<string, any>, filters?: Record<string, any>): boolean {
  if (!filters) return true
  for (const [fieldId, expected] of Object.entries(filters)) {
    if (expected === undefined || expected === null || expected === '') continue
    const actual = record?.[fieldId]
    if (Array.isArray(actual)) {
      if (!actual.includes(expected)) return false
    } else if (String(actual ?? '') !== String(expected)) {
      return false
    }
  }
  return true
}

function pct(count: number, total: number): number {
  if (total === 0) return 0
  return Math.round((count / total) * 1000) / 10
}

async function fetchNameMaps(orgId: string | null) {
  const supabase = getSupabaseAdmin()
  let industriesQuery = supabase.from('industries').select('id, name')
  industriesQuery = scopeToOrg(industriesQuery as any, orgId) as any
  let profilesQuery = supabase.from('profiles').select('id, nickname, email').neq('role', 'super_admin')
  profilesQuery = scopeToOrg(profilesQuery as any, orgId) as any
  let stagesQuery = supabase.from('pipeline_stages').select('id, name')
  stagesQuery = scopeToOrg(stagesQuery as any, orgId) as any
  let dealStagesQuery = supabase.from('deal_stages').select('id, name')
  dealStagesQuery = scopeToOrg(dealStagesQuery as any, orgId) as any

  const [{ data: industries }, { data: profiles }, { data: stages }, { data: dealStages }] = await Promise.all([
    industriesQuery,
    profilesQuery,
    stagesQuery,
    dealStagesQuery,
  ])

  return {
    industryNameById: new Map((industries ?? []).map((i: any) => [i.id, i.name])),
    memberNameById: new Map((profiles ?? []).map((p: any) => [p.id, p.nickname || p.email])),
    stageNameById: new Map((stages ?? []).map((s: any) => [s.id, s.name])),
    dealStageNameById: new Map((dealStages ?? []).map((s: any) => [s.id, s.name])),
  }
}

function groupLabelFor(
  groupBy: string | undefined,
  record: any,
  names: Awaited<ReturnType<typeof fetchNameMaps>>,
  reportType: ReportType
): string {
  if (!groupBy) return 'All'
  if (groupBy === 'month') return monthKey(new Date(record.created_at))
  if (groupBy === 'industry') return names.industryNameById.get(record.industry_id) ?? 'Unassigned'
  if (groupBy === 'assignedTo') {
    const id = reportType === 'deals' ? record.owner_id : record.assigned_to
    return names.memberNameById.get(id) ?? 'Unassigned'
  }
  if (groupBy === 'stage') {
    const map = reportType === 'deals' ? names.dealStageNameById : names.stageNameById
    return map.get(record.stage_id) ?? 'Unknown'
  }
  if (groupBy === 'leadSource') return record.lead_source ?? 'Unknown'
  if (groupBy.startsWith('custom:')) {
    const fieldId = groupBy.slice('custom:'.length)
    const value = record.custom_fields?.[fieldId]
    return value === undefined || value === null || value === '' ? 'Unspecified' : String(value)
  }
  return 'All'
}

export async function runLeadsReport(orgId: string | null, groupBy: string | undefined, filters: ReportFilters) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('leads')
    .select('id, company_name, priority, lead_source, industry_id, assigned_to, stage_id, created_at, custom_fields, lead_status(*)')
    .order('created_at', { ascending: false })
    .limit(20000)
  query = scopeToOrg(query as any, orgId) as any
  if (filters.priority) query = query.eq('priority', filters.priority)
  if (filters.industryId) query = query.eq('industry_id', filters.industryId)
  if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo)
  if (filters.stageId) query = query.eq('stage_id', filters.stageId)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)

  const rows = (data ?? [])
    .map((r: any) => ({ ...r, status: Array.isArray(r.lead_status) ? r.lead_status[0] : r.lead_status }))
    .filter((r: any) => matchesCustomFieldFilters(r.custom_fields, filters.customFields))

  const names = await fetchNameMaps(orgId)

  if (!groupBy) {
    return {
      rows: rows.slice(0, 200).map((r: any) => ({
        id: r.id,
        company_name: r.company_name,
        priority: r.priority,
        lead_source: r.lead_source,
        industry: names.industryNameById.get(r.industry_id) ?? '',
        assigned_to: names.memberNameById.get(r.assigned_to) ?? '',
        stage: names.stageNameById.get(r.stage_id) ?? '',
        created_at: r.created_at,
        cold_email_sent: Boolean(r.status?.cold_email_sent),
        replied: Boolean(r.status?.replied),
        converted: Boolean(r.status?.converted),
        custom_fields: r.custom_fields ?? {},
      })),
      truncated: rows.length > 200,
    }
  }

  const groups = new Map<string, any[]>()
  for (const r of rows) {
    const label = groupLabelFor(groupBy, r, names, 'leads')
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(r)
  }

  const grouped = [...groups.entries()]
    .map(([group, groupRows]) => {
      const coldEmailSentCount = groupRows.filter((r) => r.status?.cold_email_sent).length
      const repliedCount = groupRows.filter((r) => r.status?.replied).length
      const convertedCount = groupRows.filter((r) => r.status?.converted).length
      return {
        group,
        count: groupRows.length,
        coldEmailSentCount,
        repliedCount,
        convertedCount,
        replyRate: pct(repliedCount, groupRows.length),
        conversionRate: pct(convertedCount, groupRows.length),
      }
    })
    .sort((a, b) => b.count - a.count)

  return { rows: grouped, truncated: false }
}

export async function runDealsReport(
  orgId: string | null,
  groupBy: string | undefined,
  filters: ReportFilters,
  displayCurrency: string
) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('deals')
    .select(
      'id, name, value, currency, stage_id, probability, owner_id, expected_close_date, actual_close_date, created_at, custom_fields, closed_exchange_rate_snapshot, leads ( industry_id )'
    )
    .order('created_at', { ascending: false })
    .limit(20000)
  query = scopeToOrg(query as any, orgId) as any
  if (filters.assignedTo) query = query.eq('owner_id', filters.assignedTo)
  if (filters.stageId) query = query.eq('stage_id', filters.stageId)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)

  const liveRates = await getOrRefreshRates()
  const names = await fetchNameMaps(orgId)

  let rows = (data ?? [])
    .map((r: any) => ({ ...r, industry_id: r.leads?.industry_id ?? null }))
    .filter((r: any) => matchesCustomFieldFilters(r.custom_fields, filters.customFields))
  if (filters.industryId) rows = rows.filter((r: any) => r.industry_id === filters.industryId)

  function converted(r: any) {
    const rates = r.closed_exchange_rate_snapshot?.rates ?? liveRates.rates
    return convertAmount(Number(r.value), r.currency, displayCurrency, rates)
  }

  const dealStageById = new Map((await supabase.from('deal_stages').select('id, is_won, is_closed').then((r) => r.data ?? [])).map((s: any) => [s.id, s]))

  if (!groupBy) {
    return {
      rows: rows.slice(0, 200).map((r: any) => ({
        id: r.id,
        name: r.name,
        value: r.value,
        currency: r.currency,
        converted_value: converted(r),
        stage: names.dealStageNameById.get(r.stage_id) ?? '',
        owner: names.memberNameById.get(r.owner_id) ?? '',
        probability: r.probability,
        expected_close_date: r.expected_close_date,
        created_at: r.created_at,
        custom_fields: r.custom_fields ?? {},
      })),
      truncated: rows.length > 200,
    }
  }

  const groups = new Map<string, any[]>()
  for (const r of rows) {
    const label = groupLabelFor(groupBy, r, names, 'deals')
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(r)
  }

  const grouped = [...groups.entries()]
    .map(([group, groupRows]) => {
      const totalValue = groupRows.reduce((sum, r) => sum + converted(r), 0)
      const wonCount = groupRows.filter((r) => dealStageById.get(r.stage_id)?.is_won).length
      const closedCount = groupRows.filter((r) => dealStageById.get(r.stage_id)?.is_closed).length
      return {
        group,
        count: groupRows.length,
        totalValue,
        avgValue: groupRows.length > 0 ? totalValue / groupRows.length : 0,
        wonCount,
        winRate: pct(wonCount, closedCount),
      }
    })
    .sort((a, b) => b.totalValue - a.totalValue)

  return { rows: grouped, truncated: false, displayCurrency, ratesUpdatedAt: liveRates.fetchedAt }
}

export async function runActivityReport(orgId: string | null, groupBy: string | undefined, filters: ReportFilters) {
  const supabase = getSupabaseAdmin()

  let leadIdsQuery = supabase.from('leads').select('id')
  leadIdsQuery = scopeToOrg(leadIdsQuery as any, orgId) as any
  const { data: orgLeads, error: leadsErr } = await leadIdsQuery
  if (leadsErr) throw new HttpError(500, leadsErr.message)
  const orgLeadIds = (orgLeads ?? []).map((l: any) => l.id)
  if (orgLeadIds.length === 0) return { rows: [], truncated: false }

  let query = supabase
    .from('lead_activities')
    .select('id, type, message, created_at, created_by')
    .in('lead_id', orgLeadIds)
    .order('created_at', { ascending: false })
    .limit(20000)
  if (filters.assignedTo) query = query.eq('created_by', filters.assignedTo)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  const rows = data ?? []
  const names = await fetchNameMaps(orgId)

  if (!groupBy) {
    return {
      rows: rows.slice(0, 200).map((r: any) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        created_at: r.created_at,
        actor: names.memberNameById.get(r.created_by) ?? '',
      })),
      truncated: rows.length > 200,
    }
  }

  const groups = new Map<string, number>()
  for (const r of rows as any[]) {
    const label =
      groupBy === 'month'
        ? monthKey(new Date(r.created_at))
        : groupBy === 'assignedTo'
          ? names.memberNameById.get(r.created_by) ?? 'Unknown'
          : groupBy === 'type'
            ? r.type
            : 'All'
    groups.set(label, (groups.get(label) ?? 0) + 1)
  }

  const grouped = [...groups.entries()].map(([group, count]) => ({ group, count })).sort((a, b) => b.count - a.count)
  return { rows: grouped, truncated: false }
}
