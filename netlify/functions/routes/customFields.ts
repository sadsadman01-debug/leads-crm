import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireFeaturePermission, resolveOrganizationId, scopeToOrg, requireRowInOrgScope } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, applies_to, label, field_type, options, required, default_value, display_order'
const FIELD_TYPES = ['text', 'number', 'date', 'dropdown', 'multiselect', 'checkbox', 'url', 'textarea']
const SELECT_TYPES = ['dropdown', 'multiselect']

export async function listCustomFields(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  let query = supabase.from('custom_field_definitions').select(COLUMNS).eq('is_active', true)
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('display_order', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { fields: data ?? [] })
}

function validateBody(body: any, isCreate: boolean) {
  if (isCreate || 'applies_to' in body) {
    if (!['leads', 'deals', 'both'].includes(body.applies_to)) {
      throw new HttpError(400, 'applies_to must be "leads", "deals", or "both"')
    }
  }
  if (isCreate || 'label' in body) {
    if (!body.label?.trim()) throw new HttpError(400, 'label is required')
  }
  if (isCreate || 'field_type' in body) {
    if (!FIELD_TYPES.includes(body.field_type)) throw new HttpError(400, `field_type must be one of: ${FIELD_TYPES.join(', ')}`)
  }
  const fieldType = body.field_type
  if (SELECT_TYPES.includes(fieldType)) {
    if (!Array.isArray(body.options) || body.options.filter((o: any) => String(o).trim()).length === 0) {
      throw new HttpError(400, 'options must be a non-empty array for dropdown/multiselect fields')
    }
  }
}

export async function createCustomField(event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canManageCustomFields')
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  validateBody(body, true)

  let maxQuery = supabase.from('custom_field_definitions').select('display_order').eq('is_active', true)
  maxQuery = scopeToOrg(maxQuery as any, orgId) as any
  const { data: maxRow } = await maxQuery.order('display_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = (maxRow?.display_order ?? -1) + 1

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .insert({
      organization_id: orgId,
      applies_to: body.applies_to,
      label: body.label.trim(),
      field_type: body.field_type,
      options: SELECT_TYPES.includes(body.field_type) ? body.options.map((o: any) => String(o).trim()).filter(Boolean) : null,
      required: Boolean(body.required),
      default_value: body.default_value ?? null,
      display_order: nextOrder,
    })
    .select(COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

export async function updateCustomField(id: string, event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canManageCustomFields')
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  await requireRowInOrgScope('custom_field_definitions', id, orgId)
  const body = JSON.parse(event.body || '{}')
  validateBody(body, false)

  const update: Record<string, any> = {}
  if ('label' in body) update.label = body.label.trim()
  if ('applies_to' in body) update.applies_to = body.applies_to
  if ('required' in body) update.required = Boolean(body.required)
  if ('default_value' in body) update.default_value = body.default_value ?? null
  if ('options' in body) update.options = Array.isArray(body.options) ? body.options.map((o: any) => String(o).trim()).filter(Boolean) : null

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .update(update)
    .eq('id', id)
    .select(COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Body: { orderedIds: string[] } — full ordering, display_order becomes each id's index. */
export async function reorderCustomFields(event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canManageCustomFields')
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const orderedIds = body.orderedIds

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new HttpError(400, 'orderedIds must be a non-empty array')
  }

  let ownedQuery = supabase.from('custom_field_definitions').select('id', { count: 'exact', head: true }).in('id', orderedIds)
  ownedQuery = scopeToOrg(ownedQuery as any, orgId) as any
  const { count: ownedCount, error: ownedErr } = await ownedQuery
  if (ownedErr) throw new HttpError(500, ownedErr.message)
  if (ownedCount !== orderedIds.length) throw new HttpError(400, 'One or more fields are not in scope')

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('custom_field_definitions').update({ display_order: i }).eq('id', orderedIds[i])
    if (error) throw new HttpError(500, error.message)
  }

  return listCustomFields(event, user)
}

/** Soft-delete: hides the field from forms/the builder but leaves any values
 * already stored in leads/deals.custom_fields untouched (they just become
 * orphaned data — never corrupted, per the spec). */
export async function deleteCustomField(id: string, event: HandlerEvent, user: AuthedUser) {
  requireFeaturePermission(user, 'canManageCustomFields')
  const orgId = resolveOrganizationId(user, event)
  await requireRowInOrgScope('custom_field_definitions', id, orgId)

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('custom_field_definitions').update({ is_active: false }).eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
