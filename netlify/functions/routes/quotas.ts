import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId, scopeToOrg, requireRowInOrgScope } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const COLUMNS = 'id, user_id, period_type, period_key, amount, currency'

export async function listQuotas(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  let query = supabase.from('quotas').select(COLUMNS)
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('period_key', { ascending: false })
  if (error) throw new HttpError(500, error.message)
  return json(200, { quotas: data ?? [] })
}

/** Body: { user_id?: string|null, period_type, period_key, amount, currency }.
 * Upserts on (organization_id, user_id, period_type, period_key). */
export async function upsertQuota(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')

  if (!['month', 'quarter'].includes(body.period_type)) throw new HttpError(400, 'period_type must be "month" or "quarter"')
  if (!body.period_key?.trim()) throw new HttpError(400, 'period_key is required')
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, 'amount must be a non-negative number')

  const userId = body.user_id || null

  let existingQuery = supabase
    .from('quotas')
    .select('id')
    .eq('period_type', body.period_type)
    .eq('period_key', body.period_key)
  existingQuery = scopeToOrg(existingQuery as any, orgId) as any
  existingQuery = userId ? existingQuery.eq('user_id', userId) : existingQuery.is('user_id', null)
  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('quotas')
      .update({ amount, currency: body.currency ?? 'USD' })
      .eq('id', existing.id)
      .select(COLUMNS)
      .single()
    if (error) throw new HttpError(500, error.message)
    return json(200, data)
  }

  const { data, error } = await supabase
    .from('quotas')
    .insert({
      organization_id: orgId,
      user_id: userId,
      period_type: body.period_type,
      period_key: body.period_key,
      amount,
      currency: body.currency ?? 'USD',
    })
    .select(COLUMNS)
    .single()
  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

export async function deleteQuota(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const orgId = resolveOrganizationId(user, event)
  await requireRowInOrgScope('quotas', id, orgId)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('quotas').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
