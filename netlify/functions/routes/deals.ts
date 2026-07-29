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
  requireAdminOrAbove,
  requireAal2IfEnrolled,
} from '../lib/permissions.js'
import { loadActiveDefinitions, requireRequiredFieldsFilled, mergeCustomFieldValues } from '../lib/customFieldValues.js'
import { logAuditEvent } from '../lib/auditLog.js'
import { findDealDuplicatePairs, groupPairsIntoClusters, dismissalKey } from '../lib/duplicateMatch.js'

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

const MAX_DUPLICATE_SCAN_DEALS = 1500

/** Any authenticated team member can VIEW suggestions, scoped to whatever
 * deals their own visibility permissions already let them see — only
 * Admin/Super Admin can dismiss a pair or execute a merge. */
export async function findDealDuplicates(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)

  let query = supabase.from('deals').select(DEAL_SELECT)
  query = scopeToOrg(query as any, orgId) as any
  query = applyDealVisibility(query as any, user) as any
  const { data, error } = await query.order('created_at', { ascending: false }).limit(MAX_DUPLICATE_SCAN_DEALS)
  if (error) throw new HttpError(500, error.message)
  const deals = (data ?? []).map(normalizeDeal)

  let dismissalsQuery = supabase.from('duplicate_dismissals').select('record_id_a, record_id_b').eq('record_type', 'deal')
  dismissalsQuery = scopeToOrg(dismissalsQuery as any, orgId) as any
  const { data: dismissals, error: dismErr } = await dismissalsQuery
  if (dismErr) throw new HttpError(500, dismErr.message)
  const dismissedKeys = new Set((dismissals ?? []).map((d) => dismissalKey(d.record_id_a, d.record_id_b)))

  const pairs = findDealDuplicatePairs(deals).filter((p) => !dismissedKeys.has(dismissalKey(p.a, p.b)))
  const clusters = groupPairsIntoClusters(deals, pairs)
  const groups = clusters.map((dealsInGroup) => ({ deals: dealsInGroup }))

  return json(200, { groups, truncated: deals.length >= MAX_DUPLICATE_SCAN_DEALS })
}

export async function dismissDealDuplicate(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const { dealIdA, dealIdB } = body
  if (!dealIdA || !dealIdB) throw new HttpError(400, 'dealIdA and dealIdB are required')

  const { data: rows, error: fetchErr } = await supabase
    .from('deals')
    .select('id, organization_id')
    .in('id', [dealIdA, dealIdB])
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if ((rows ?? []).length !== 2 || (rows ?? []).some((r) => (r.organization_id ?? null) !== orgId)) {
    throw new HttpError(404, 'Deal not found')
  }

  const { error } = await supabase
    .from('duplicate_dismissals')
    .insert({ record_type: 'deal', organization_id: orgId, record_id_a: dealIdA, record_id_b: dealIdB, dismissed_by: user.id })
  if (error && (error as any).code !== '23505') throw new HttpError(500, error.message)

  return json(200, { success: true })
}

const MERGEABLE_DEAL_FIELDS = [
  'name', 'value', 'currency', 'stage_id', 'probability',
  'expected_close_date', 'actual_close_date', 'outcome_reason', 'owner_id', 'notes',
]

async function fetchDealForMerge(id: string, orgId: string | null) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('deals').select(DEAL_SELECT).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Deal not found')
  if ((data.organization_id ?? null) !== orgId) throw new HttpError(404, 'Deal not found')
  return normalizeDeal(data)
}

/** Deals have no dedicated Activity Timeline table of their own — deal
 * lifecycle events already log onto their linked Lead's timeline elsewhere
 * in this file (create/close/delete), so the merge note follows the same
 * convention rather than introducing a new table. */
export async function mergeDeals(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const survivorId = body.survivorId
  const loserId = body.loserId
  if (!survivorId || !loserId) throw new HttpError(400, 'survivorId and loserId are required')
  if (survivorId === loserId) throw new HttpError(400, 'Cannot merge a deal with itself')

  const [survivor, loser] = await Promise.all([
    fetchDealForMerge(survivorId, orgId),
    fetchDealForMerge(loserId, orgId),
  ])

  const requestedFields = body.fields ?? {}
  const fieldUpdate: Record<string, any> = {}
  const survivorFieldBackup: Record<string, any> = {}
  for (const key of MERGEABLE_DEAL_FIELDS) {
    if (!(key in requestedFields)) continue
    const newValue = requestedFields[key]
    if (JSON.stringify(newValue ?? null) === JSON.stringify((survivor as any)[key] ?? null)) continue
    if (key === 'name' && !String(newValue ?? '').trim()) throw new HttpError(400, 'name cannot be empty')
    fieldUpdate[key] = newValue
    survivorFieldBackup[key] = (survivor as any)[key] ?? null
  }

  const defs = await loadActiveDefinitions(orgId, 'deals')
  const defIds = new Set(defs.map((d) => d.id))
  const requestedCustomFields = body.customFields ?? {}
  const nextCustomFields = { ...(survivor.custom_fields ?? {}) }
  const customFieldsBackup: Record<string, any> = {}
  for (const [fieldId, value] of Object.entries(requestedCustomFields)) {
    if (!defIds.has(fieldId)) continue
    if (JSON.stringify(nextCustomFields[fieldId] ?? null) === JSON.stringify(value ?? null)) continue
    customFieldsBackup[fieldId] = nextCustomFields[fieldId] ?? null
    nextCustomFields[fieldId] = value
  }
  if (Object.keys(customFieldsBackup).length > 0) fieldUpdate.custom_fields = nextCustomFields

  if (Object.keys(fieldUpdate).length > 0) {
    const { error } = await supabase.from('deals').update(fieldUpdate).eq('id', survivorId)
    if (error) throw new HttpError(500, error.message)
  }

  const actorLabel = user.nickname || user.email
  const { data: mergeNote, error: noteErr } = await supabase
    .from('lead_activities')
    .insert({
      lead_id: survivor.lead_id,
      type: 'deal',
      message: `Deal "${loser.name}" merged into "${survivor.name}" — by ${actorLabel}`,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (noteErr) throw new HttpError(500, noteErr.message)

  const { data: snapshot, error: snapErr } = await supabase
    .from('merge_snapshots')
    .insert({
      record_type: 'deal',
      organization_id: orgId,
      survivor_id: survivorId,
      loser_id: loserId,
      loser_snapshot: loser,
      survivor_backup: { fields: survivorFieldBackup, customFields: customFieldsBackup, status: {} },
      merge_note_activity_id: mergeNote.id,
      merged_by: user.id,
    })
    .select('id')
    .single()
  if (snapErr) throw new HttpError(500, snapErr.message)

  const { error: delErr } = await supabase.from('deals').delete().eq('id', loserId)
  if (delErr) throw new HttpError(500, delErr.message)

  await logAuditEvent('deals_merged', user, event, {
    organizationId: orgId,
    metadata: { survivorId, loserId, survivorName: survivor.name, loserName: loser.name, snapshotId: snapshot.id },
  })

  const result = await getDeal(survivorId, orgId, user)
  return json(result.statusCode, { ...JSON.parse(result.body), mergeSnapshotId: snapshot.id })
}
