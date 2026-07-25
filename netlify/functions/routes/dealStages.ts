import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const STAGE_COLUMNS = 'id, name, position, default_probability, is_closed, is_won'

export async function listDealStages() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('deal_stages').select(STAGE_COLUMNS).order('position', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { stages: data ?? [] })
}

export async function createDealStage(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const name = (body.name ?? '').trim()
  if (!name) throw new HttpError(400, 'name is required')

  const { data: maxRow } = await supabase
    .from('deal_stages')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (maxRow?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('deal_stages')
    .insert({
      name,
      position: nextPosition,
      default_probability: clampProbability(body.default_probability, 0),
      is_closed: Boolean(body.is_closed),
      is_won: Boolean(body.is_won),
    })
    .select(STAGE_COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

function clampProbability(value: any, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

export async function updateDealStage(id: string, event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}
  if ('name' in body) {
    const name = (body.name ?? '').trim()
    if (!name) throw new HttpError(400, 'name cannot be empty')
    update.name = name
  }
  if ('default_probability' in body) update.default_probability = clampProbability(body.default_probability, 0)
  if ('is_closed' in body) update.is_closed = Boolean(body.is_closed)
  if ('is_won' in body) update.is_won = Boolean(body.is_won)

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase
    .from('deal_stages')
    .update(update)
    .eq('id', id)
    .select(STAGE_COLUMNS)
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Body: { orderedIds: string[] } — full ordering, position becomes each id's index. */
export async function reorderDealStages(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const orderedIds = body.orderedIds

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new HttpError(400, 'orderedIds must be a non-empty array')
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('deal_stages').update({ position: 10000 + i }).eq('id', orderedIds[i])
    if (error) throw new HttpError(500, error.message)
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('deal_stages').update({ position: i }).eq('id', orderedIds[i])
    if (error) throw new HttpError(500, error.message)
  }

  return listDealStages()
}

export async function deleteDealStage(id: string, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()

  const { count, error: countErr } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', id)
  if (countErr) throw new HttpError(500, countErr.message)

  if (count && count > 0) {
    throw new HttpError(
      400,
      `${count} deal${count === 1 ? '' : 's'} still on this stage — move ${count === 1 ? 'it' : 'them'} to another stage before deleting it.`
    )
  }

  const { error } = await supabase.from('deal_stages').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
