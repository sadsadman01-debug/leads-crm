import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { logActivity } from '../lib/activities.js'
import type { AuthedUser } from '../lib/auth.js'

export const DEAL_SELECT = `
  id, lead_id, name, value, currency, stage_id, probability,
  expected_close_date, actual_close_date, outcome_reason, notes, owner_id,
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

export async function listDeals(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const params = event.queryStringParameters ?? {}
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize ?? '20', 10) || 20))
  const sortBy = ['name', 'value', 'expected_close_date', 'created_at', 'updated_at'].includes(params.sortBy ?? '')
    ? params.sortBy!
    : 'created_at'
  const sortOrder = params.sortOrder === 'asc'
  const filters = parseFilters(params)

  let query = supabase.from('deals').select(DEAL_SELECT, { count: 'exact' })

  if (filters.leadId) query = query.eq('lead_id', filters.leadId)
  if (filters.stageId) query = query.eq('stage_id', filters.stageId)
  if (filters.search) query = query.ilike('name', `%${filters.search}%`)

  // Resolve industry -> lead ids first (same pattern as leads.ts's resolveJoinFilteredIds)
  // so the .in('lead_id', ...) constraint applies before pagination, not after.
  if (filters.industryId) {
    const { data: leadRows, error: leadErr } = await supabase
      .from('leads')
      .select('id')
      .eq('industry_id', filters.industryId)
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

export async function getDeal(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('deals').select(DEAL_SELECT).eq('id', id).single()
  if (error) throw new HttpError(404, 'Deal not found')
  return json(200, normalizeDeal(data))
}

async function resolveDefaultStage() {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('deal_stages')
    .select('id, default_probability')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

export async function createDeal(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  if (!body.lead_id) throw new HttpError(400, 'lead_id is required')
  if (!body.name?.trim()) throw new HttpError(400, 'name is required')

  let stageId = body.stage_id ?? null
  let probability = body.probability

  if (!stageId) {
    const defaultStage = await resolveDefaultStage()
    stageId = defaultStage?.id ?? null
    if (probability === undefined) probability = defaultStage?.default_probability ?? 0
  }
  if (probability === undefined) probability = 0

  let currency = body.currency
  if (!currency) {
    const { data: settings } = await supabase.from('app_settings').select('default_currency').eq('id', 1).single()
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
      owner_id: user.id,
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

  return getDeal(data.id)
}

export async function updateDeal(id: string, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const updatable: Record<string, any> = {}
  for (const key of ['name', 'value', 'currency', 'probability', 'expected_close_date', 'notes']) {
    if (key in body) updatable[key] = body[key]
  }

  if (Object.keys(updatable).length === 0) throw new HttpError(400, 'Nothing to update')

  const { error } = await supabase.from('deals').update(updatable).eq('id', id)
  if (error) throw new HttpError(500, error.message)

  return getDeal(id)
}

/** Body: { stage_id, probability?, outcome_reason?, actual_close_date? } */
export async function updateDealStage(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const stageId = body.stage_id
  if (!stageId) throw new HttpError(400, 'stage_id is required')

  const { data: deal, error: dealErr } = await supabase
    .from('deals')
    .select('id, name, lead_id, value, currency')
    .eq('id', id)
    .single()
  if (dealErr) throw new HttpError(404, 'Deal not found')

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
  } else {
    update.outcome_reason = null
    update.actual_close_date = null
  }

  const { error } = await supabase.from('deals').update(update).eq('id', id)
  if (error) throw new HttpError(500, error.message)

  const message = stage.is_closed
    ? `Deal "${deal.name}" Closed ${stage.is_won ? 'Won' : 'Lost'} (${formatCurrency(Number(deal.value), deal.currency)})${
        stage.is_won ? '' : ` — ${update.outcome_reason}`
      }`
    : `Deal "${deal.name}" moved to ${stage.name}`
  await logActivity(deal.lead_id, 'deal', message, user.id)

  return getDeal(id)
}

export async function deleteDeal(id: string) {
  const supabase = getSupabaseAdmin()

  const { data: deal } = await supabase.from('deals').select('name, lead_id').eq('id', id).single()

  const { error } = await supabase.from('deals').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)

  if (deal) await logActivity(deal.lead_id, 'deal', `Deal "${deal.name}" deleted`)

  return json(200, { success: true })
}

const KANBAN_SELECT = `
  id, name, value, currency, stage_id, probability, expected_close_date, lead_id,
  leads ( company_name )
`
const KANBAN_MAX_DEALS = 1000

export async function getDealsKanban(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const industryId = event.queryStringParameters?.industryId

  let query = supabase.from('deals').select(KANBAN_SELECT)

  if (industryId) {
    const { data: leadRows, error: leadErr } = await supabase.from('leads').select('id').eq('industry_id', industryId)
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
    company_name: row.leads?.company_name ?? '',
  }))

  return json(200, { deals, truncated: deals.length >= KANBAN_MAX_DEALS })
}
