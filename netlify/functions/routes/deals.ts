import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { logActivity } from '../lib/activities.js'
import { getOrRefreshRates } from '../lib/exchangeRates.js'
import { notifyAssignment, notifyOrgAdmins } from '../lib/notifications.js'
import type { AuthedUser } from '../lib/auth.js'
import {
  requireCanModifyRecord,
  requireCanDeleteRecord,
  isAdminOrAbove,
  isRecordVisible,
  resolveOrganizationId,
  scopeToOrg,
  applyDealVisibility,
} from '../lib/permissions.js'
import { loadActiveDefinitions, requireRequiredFieldsFilled, mergeCustomFieldValues } from '../lib/customFieldValues.js'

export const DEAL_SELECT = `
  id, lead_id, name, value, currency, stage_id, probability,
  expected_close_date, actual_close_date, outcome_reason, notes, owner_id, organization_id, custom_fields,
  created_at, updated_at,
  leads ( id, company_name, industry_id )
`

export function normalizeDeal(row: any) {
  if (!row) return row
  const { leads, ...rest } = row
  return { ...rest, lead: leads ?? null }
}

/** Hides the monetary value everywhere a deal is returned to a User who lacks
 * canViewDealValues — the field comes back null with a masked flag, never the
 * real number, so a frontend bug can't accidentally leak it via devtools. */
function applyValueMask(deal: any, user: AuthedUser) {
  if (isAdminOrAbove(user) || user.permissions.canViewDealValues) return deal
  return { ...deal, value: null, value_masked: true }
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
  query = applyDealVisibility(query as any, user) as any

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

  return json(200, {
    deals: (data ?? []).map(normalizeDeal).map((d) => applyValueMask(d, user)),
    page,
    pageSize,
    total: count ?? 0,
  })
}

export async function getDeal(id: string, organizationId: string | null, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('deals').select(DEAL_SELECT).eq('id', id).single()
  if (error || !data) throw new HttpError(404, 'Deal not found')
  if (user.role !== 'super_admin' && data.organization_id !== organizationId) throw new HttpError(404, 'Deal not found')
  if (!isRecordVisible(user, data, 'deal')) throw new HttpError(404, 'Deal not found')
  return json(200, applyValueMask(normalizeDeal(data), user))
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

  const dealFieldDefs = await loadActiveDefinitions(orgId, 'deals')
  const incomingCustomFields = body.custom_fields ?? {}
  requireRequiredFieldsFilled(dealFieldDefs, incomingCustomFields)
  const { merged: customFields } = mergeCustomFieldValues({}, incomingCustomFields, dealFieldDefs)

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
      custom_fields: customFields,
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

  await notifyAssignment({
    assigneeId: ownerId,
    actorId: user.id,
    organizationId: orgId,
    type: 'deal_assigned',
    title: 'New deal assigned to you',
    message: `"${data.name}" was assigned to you.`,
    linkRoute: '/deals',
    entityId: data.id,
    entityType: 'deal',
  })

  return getDeal(data.id, orgId, user)
}

export async function updateDeal(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const { existing, orgId } = await fetchDealInScope(id, user, event, 'id, name, owner_id, organization_id, lead_id, custom_fields')
  requireCanModifyRecord(user, existing, 'deal')

  const updatable: Record<string, any> = {}
  for (const key of ['name', 'value', 'currency', 'probability', 'expected_close_date', 'notes']) {
    if (key in body) updatable[key] = body[key]
  }

  // Reassignment is restricted to admins/super admins, or the current owner
  // handing the deal off to someone else.
  let newOwner: string | null = null
  if ('owner_id' in body) {
    if (!isAdminOrAbove(user) && existing.owner_id !== user.id) {
      throw new HttpError(403, 'Only an admin or the current owner can reassign this deal')
    }
    newOwner = body.owner_id || null
    updatable.owner_id = newOwner
  }

  let customFieldMessages: string[] = []
  if ('custom_fields' in body) {
    const defs = await loadActiveDefinitions(existing.organization_id, 'deals')
    const { merged, messages } = mergeCustomFieldValues(existing.custom_fields ?? {}, body.custom_fields ?? {}, defs)
    updatable.custom_fields = merged
    customFieldMessages = messages
  }

  if (Object.keys(updatable).length === 0) throw new HttpError(400, 'Nothing to update')

  const { error } = await supabase.from('deals').update(updatable).eq('id', id)
  if (error) throw new HttpError(500, error.message)

  for (const message of customFieldMessages) {
    await logActivity(existing.lead_id, 'custom_field', message, user.id)
  }

  if ('owner_id' in body) {
    await notifyAssignment({
      assigneeId: newOwner,
      actorId: user.id,
      organizationId: existing.organization_id,
      type: 'deal_assigned',
      title: 'Deal assigned to you',
      message: `"${updatable.name ?? existing.name}" was reassigned to you.`,
      linkRoute: '/deals',
      entityId: id,
      entityType: 'deal',
    })
  }

  return getDeal(id, orgId, user)
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
  requireCanModifyRecord(user, deal, 'deal')

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

  if (stage.is_closed && orgId) {
    await notifyOrgAdmins(orgId, {
      type: stage.is_won ? 'deal_closed_won' : 'deal_closed_lost',
      title: stage.is_won ? 'Deal Closed Won' : 'Deal Closed Lost',
      message: `"${deal.name}" (${formatCurrency(Number(deal.value), deal.currency)}) was Closed ${stage.is_won ? 'Won' : 'Lost'}.`,
      link_route: '/deals',
      related_entity_id: id,
      related_entity_type: 'deal',
    })
  }

  return getDeal(id, orgId, user)
}

export async function deleteDeal(id: string, event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const { existing: deal } = await fetchDealInScope(id, user, event, 'id, name, lead_id, owner_id, organization_id')
  requireCanDeleteRecord(user, deal, 'deal')

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
  query = applyDealVisibility(query as any, user) as any
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

  const canViewValues = isAdminOrAbove(user) || user.permissions.canViewDealValues
  const deals = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    value: canViewValues ? row.value : null,
    value_masked: canViewValues ? undefined : true,
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
