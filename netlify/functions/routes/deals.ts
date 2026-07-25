import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { logActivity } from '../lib/activities.js'
import { getOrRefreshRates } from '../lib/exchangeRates.js'
import type { AuthedUser } from '../lib/auth.js'
import { requireCanModifyRecord, isAdminOrAbove, resolveOrganizationId, scopeToOrg } from '../lib/permissions.js'

export const DEAL_SELECT = `
  id, lead_id, name, value, currency, stage_id, probability,
  expected_close_date, actual_close_date, outcome_reason, notes, owner_id, organization_id,
  created_at, updated_at,
  leads ( id, company_name, industry_id )
`

export function normalizeDeal(row: any) {
  if (!row) return row
  const { leads, ...rest } = row
  return { ...rest, lead: leads ?? null }
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

export interface DealFilters {
  leadId?: string
  stageId?: string
  industryId?: string
  search?: string
  assignedTo?: string
}

function parseFilters(params: Record<string, string | undefined>): DealFilters {
  if (!params.filters) return {}
  try {
    const parsed = JSON.parse(params.filters)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export async function listDeals(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const params = event.queryStringParameters ?? {}
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize ?? '20', 10) || 20))
  const sortBy = ['name', 'value', 'expected_close_date', 'created_at', 'updated_at'].includes(params.sortBy ?? '')
    ? params.sortBy!
    : 'created_at'
  const sortOrder = params.sortOrder === 'asc'
  const filters = parseFilters(params)

  let query = supabase.from('deals').select(DEAL_SELECT, { count: 'exact' })
  query = scopeToOrg(query as any, orgId) as any

  if (filters.leadId) query = query.eq('lead_id', filters.leadId)
  if (filters.stageId) query = query.eq('stage_id', filters.stageId)
  if (filters.assignedTo) query = query.eq('owner_id', filters.assignedTo)
  if (filters.search) query = query.ilike('name', `%${filters.search}%`)

  // Resolve industry -> lead ids first (same pattern as leads.ts's resolveJoinFilteredIds)
  // so the .in('lead_id', ...) constraint applies before pagination, not after.
  if (filters.industryId) {
    let leadQuery = supabase.from('leads').select('id').eq('industry_id', filters.industryId)
    leadQuery = scopeToOrg(leadQuery as any, orgId) as any
    const { data: leadRows, error: leadErr } = await leadQuery
    if (leadErr) throw new HttpError(500, leadErr.message)

    const leadIds = (leadRows ?? []).map((l) => l.id)
    if (leadIds.length === 0) return json(200, { deals: [], page, pageSize, total: 0 })
    query = query.in('lead_id', leadIds)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query.order(sortBy, { ascending: sortOrder }).range(from, to)
  if (error) throw new HttpError(500, error.message)

  return json(200, { deals: (data ?? []).map(normalizeDeal), page, pageSize, total: count ?? 0 })
}

export async function getDeal(id: string, organizationId: string | null, isSuperAdmin: boolean) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('deals').select(DEAL_SELECT).eq('id', id).single()
  if (error || !data) throw new HttpError(404, 'Deal not found')
  if (!isSuperAdmin && data.organization_id !== organizationId) throw new HttpError(404, 'Deal not found')
  return json(200, normalizeDeal(data))
}

async function fetchDealInScope(id: string, user: AuthedUser, event: HandlerEvent, columns: string) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const { data: existing, error: fetchErr } = await supabase.from('deals').select(columns).eq('id', id).single()
  if (fetchErr || !existing) throw new HttpError(404, 'Deal not found')
  if (user.role !== 'super_admin' && (existing as any).organization_id !== orgId) throw new HttpError(404, 'Deal not found')
  return { existing: existing as any, orgId }
}

async function resolveDefaultStage(orgId: string | null) {
  const supabase = getSupabaseAdmin()
  let query = supabase.from('deal_stages').select('id, default_probability')
  query = scopeToOrg(query as any, orgId) as any
  const { data } = await query.order('position', { ascending: true }).limit(1).maybeSingle()
  return data
}

export async function createDeal(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')

  if (!body.lead_id) throw new HttpError(400, 'lead_id is required')
  if (!body.name?.trim()) throw new HttpError(400, 'name is required')

  // The linked lead must belong to the same organization scope this deal is being created in.
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, organization_id')
    .eq('id', body.lead_id)
    .single()
  if (leadErr || !lead) throw new HttpError(404, 'Lead not found')
  if (lead.organization_id !== orgId) throw new HttpError(400, 'That lead does not belong to this organization')

  // New deals auto-assign to the creator; explicit owner_id is only honored for admins/super admins.
  const ownerId = isAdminOrAbove(user) && body.owner_id ? body.owner_id : user.id

  let stageId = body.stage_id ?? null
  let probability = body.probability

  if (!stageId) {
    const defaultStage = await resolveDefaultStage(orgId)
    stageId = defaultStage?.id ?? null
    if (probability === undefined) probability = defaultStage?.default_probability ?? 0
  }
  if (probability === undefined) probability = 0

  let currency = body.currency
  if (!currency) {
    let settingsQuery = supabase.from('app_settings').select('default_currency')
    settingsQuery = scopeToOrg(settingsQuery as any, orgId) as any
    const { data: settings } = await settingsQuery.maybeSingle()
    currency = settings?.default_currency ?? 'USD'
  }

  const { data, error } = await supabase
    .from('deals')
    .insert({
      lead_id: body.lead_id,
      name: body.name.trim(),
      value: Number(body.value) || 0,
      currency,
      stage_id: stageId,
      probability,
      expected_close_date: body.expected_close_date || null,
      notes: body.notes ?? null,
      owner_id: ownerId,
      organization_id: orgId,
    })
    .select('id, name, value, currency')
    .single()

  if (error) throw new HttpError(500, error.message)

  await logActivity(
    body.lead_id,
    'deal',
    `Deal "${data.name}" created (${formatCurrency(Number(data.value), data.currency)})`,
    user.id
  )

  return getDeal(data.id, orgId, user.role === 'super_admin')
}

export async function updateDeal(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const { existing, orgId } = await fetchDealInScope(id, user, event, 'id, owner_id, organization_id')
  requireCanModifyRecord(user, existing)

  const updatable: Record<string, any> = {}
  for (const key of ['name', 'value', 'currency', 'probability', 'expected_close_date', 'notes']) {
    if (key in body) updatable[key] = body[key]
  }

  // Reassignment is restricted to admins/super admins, or the current owner
  // handing the deal off to someone else.
  if ('owner_id' in body) {
    if (!isAdminOrAbove(user) && existing.owner_id !== user.id) {
      throw new HttpError(403, 'Only an admin or the current owner can reassign this deal')
    }
    updatable.owner_id = body.owner_id || null
  }

  if (Object.keys(updatable).length === 0) throw new HttpError(400, 'Nothing to update')

  const { error } = await supabase.from('deals').update(updatable).eq('id', id)
  if (error) throw new HttpError(500, error.message)

  return getDeal(id, orgId, user.role === 'super_admin')
}

/** Body: { stage_id, probability?, outcome_reason?, actual_close_date? } */
export async function updateDealStage(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const stageId = body.stage_id
  if (!stageId) throw new HttpError(400, 'stage_id is required')

  const { existing: deal, orgId } = await fetchDealInScope(
    id,
    user,
    event,
    'id, name, lead_id, value, currency, owner_id, organization_id'
  )
  requireCanModifyRecord(user, deal)

  const { data: stage, error: stageErr } = await supabase
    .from('deal_stages')
    .select('id, name, default_probability, is_closed, is_won')
    .eq('id', stageId)
    .single()
  if (stageErr) throw new HttpError(404, 'Deal stage not found')

  if (stage.is_closed && !body.outcome_reason?.trim()) {
    throw new HttpError(400, 'outcome_reason is required when closing a deal')
  }

  const update: Record<string, any> = {
    stage_id: stageId,
    probability: body.probability ?? stage.default_probability,
  }

  if (stage.is_closed) {
    update.outcome_reason = body.outcome_reason.trim()
    update.actual_close_date = body.actual_close_date || new Date().toISOString().slice(0, 10)
    // Lock in the exchange rates at the moment of closing so historical revenue
    // reporting never silently shifts as live rates fluctuate later.
    update.closed_exchange_rate_snapshot = await getOrRefreshRates()
  } else {
    update.outcome_reason = null
    update.actual_close_date = null
    update.closed_exchange_rate_snapshot = null
  }

  const { error } = await supabase.from('deals').update(update).eq('id', id)
  if (error) throw new HttpError(500, error.message)

  const message = stage.is_closed
    ? `Deal "${deal.name}" Closed ${stage.is_won ? 'Won' : 'Lost'} (${formatCurrency(Number(deal.value), deal.currency)})${
        stage.is_won ? '' : ` — ${update.outcome_reason}`
      }`
    : `Deal "${deal.name}" moved to ${stage.name}`
  await logActivity(deal.lead_id, 'deal', message, user.id)

  return getDeal(id, orgId, user.role === 'super_admin')
}

export async function deleteDeal(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { existing: deal } = await fetchDealInScope(id, user, event, 'id, name, lead_id, owner_id, organization_id')
  requireCanModifyRecord(user, deal)

  const { error } = await supabase.from('deals').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)

  await logActivity(deal.lead_id, 'deal', `Deal "${deal.name}" deleted`, user.id)

  return json(200, { success: true })
}

const KANBAN_SELECT = `
  id, name, value, currency, stage_id, probability, expected_close_date, lead_id, owner_id,
  leads ( company_name )
`
const KANBAN_MAX_DEALS = 1000

export async function getDealsKanban(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const industryId = event.queryStringParameters?.industryId
  const assignedTo = event.queryStringParameters?.assignedTo

  let query = supabase.from('deals').select(KANBAN_SELECT)
  query = scopeToOrg(query as any, orgId) as any
  if (assignedTo) query = query.eq('owner_id', assignedTo)

  if (industryId) {
    let leadQuery = supabase.from('leads').select('id').eq('industry_id', industryId)
    leadQuery = scopeToOrg(leadQuery as any, orgId) as any
    const { data: leadRows, error: leadErr } = await leadQuery
    if (leadErr) throw new HttpError(500, leadErr.message)

    const leadIds = (leadRows ?? []).map((l) => l.id)
    if (leadIds.length === 0) return json(200, { deals: [], truncated: false })
    query = query.in('lead_id', leadIds)
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(KANBAN_MAX_DEALS)
  if (error) throw new HttpError(500, error.message)

  const deals = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    value: row.value,
    currency: row.currency,
    stage_id: row.stage_id,
    probability: row.probability,
    expected_close_date: row.expected_close_date,
    lead_id: row.lead_id,
    owner_id: row.owner_id,
    company_name: row.leads?.company_name ?? '',
  }))

  return json(200, { deals, truncated: deals.length >= KANBAN_MAX_DEALS })
}
