import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId, scopeToOrg, requireRowInOrgScope } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

export async function listWinLossReasons(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  let query = supabase.from('win_loss_reasons').select('id, label')
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('label', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { reasons: data ?? [] })
}

export async function createWinLossReason(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const label = (body.label ?? '').trim()
  if (!label) throw new HttpError(400, 'label is required')

  const { data, error } = await supabase
    .from('win_loss_reasons')
    .insert({ label, organization_id: orgId })
    .select('id, label')
    .single()

  if (error) {
    if (error.code === '23505') throw new HttpError(400, `"${label}" already exists`)
    throw new HttpError(500, error.message)
  }
  return json(201, data)
}

export async function renameWinLossReason(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  await requireRowInOrgScope('win_loss_reasons', id, resolveOrganizationId(user, event))
  const body = JSON.parse(event.body || '{}')
  const label = (body.label ?? '').trim()
  if (!label) throw new HttpError(400, 'label is required')

  const { data, error } = await supabase
    .from('win_loss_reasons')
    .update({ label })
    .eq('id', id)
    .select('id, label')
    .single()

  if (error) {
    if (error.code === '23505') throw new HttpError(400, `"${label}" already exists`)
    throw new HttpError(500, error.message)
  }
  return json(200, data)
}

export async function deleteWinLossReason(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  await requireRowInOrgScope('win_loss_reasons', id, resolveOrganizationId(user, event))
  const { error } = await supabase.from('win_loss_reasons').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
