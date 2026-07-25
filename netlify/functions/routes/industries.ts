import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId, scopeToOrg, requireRowInOrgScope } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

export async function listIndustries(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  let query = supabase.from('industries').select('id, name')
  query = scopeToOrg(query as any, orgId) as any
  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { industries: data ?? [] })
}

export async function createIndustry(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')
  const name = (body.name ?? '').trim()
  if (!name) throw new HttpError(400, 'name is required')

  const { data, error } = await supabase
    .from('industries')
    .insert({ name, organization_id: orgId })
    .select('id, name')
    .single()

  if (error) {
    if (error.code === '23505') throw new HttpError(400, `"${name}" already exists`)
    throw new HttpError(500, error.message)
  }
  return json(201, data)
}

export async function renameIndustry(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  await requireRowInOrgScope('industries', id, resolveOrganizationId(user, event))
  const body = JSON.parse(event.body || '{}')
  const name = (body.name ?? '').trim()
  if (!name) throw new HttpError(400, 'name is required')

  const { data, error } = await supabase
    .from('industries')
    .update({ name })
    .eq('id', id)
    .select('id, name')
    .single()

  if (error) {
    if (error.code === '23505') throw new HttpError(400, `"${name}" already exists`)
    throw new HttpError(500, error.message)
  }
  return json(200, data)
}

export async function deleteIndustry(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  await requireRowInOrgScope('industries', id, resolveOrganizationId(user, event))

  const { count, error: countErr } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('industry_id', id)
  if (countErr) throw new HttpError(500, countErr.message)

  if (count && count > 0) {
    throw new HttpError(
      400,
      `${count} lead${count === 1 ? '' : 's'} still assigned to this industry — reassign ${count === 1 ? 'it' : 'them'} before deleting it.`
    )
  }

  const { error } = await supabase.from('industries').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
