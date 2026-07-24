import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'

export async function listStages() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('pipeline_stages').select('id, name, position').order('position', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { stages: data ?? [] })
}

export async function createStage(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const name = (body.name ?? '').trim()
  if (!name) throw new HttpError(400, 'name is required')

  const { data: maxRow } = await supabase
    .from('pipeline_stages')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (maxRow?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('pipeline_stages')
    .insert({ name, position: nextPosition })
    .select('id, name, position')
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(201, data)
}

export async function renameStage(id: string, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const name = (body.name ?? '').trim()
  if (!name) throw new HttpError(400, 'name is required')

  const { data, error } = await supabase
    .from('pipeline_stages')
    .update({ name })
    .eq('id', id)
    .select('id, name, position')
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Body: { orderedIds: string[] } — full ordering, position becomes each id's index. */
export async function reorderStages(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const orderedIds = body.orderedIds

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new HttpError(400, 'orderedIds must be a non-empty array')
  }

  // Shift everyone into a disjoint high range first so the unique position index
  // never collides mid-update (e.g. swapping stage A<->B's positions directly).
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('pipeline_stages')
      .update({ position: 10000 + i })
      .eq('id', orderedIds[i])
    if (error) throw new HttpError(500, error.message)
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('pipeline_stages').update({ position: i }).eq('id', orderedIds[i])
    if (error) throw new HttpError(500, error.message)
  }

  return listStages()
}

export async function deleteStage(id: string) {
  const supabase = getSupabaseAdmin()

  const { count, error: countErr } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', id)
  if (countErr) throw new HttpError(500, countErr.message)

  if (count && count > 0) {
    throw new HttpError(
      400,
      `${count} lead${count === 1 ? '' : 's'} still on this stage — move ${count === 1 ? 'it' : 'them'} to another stage before deleting it.`
    )
  }

  const { error } = await supabase.from('pipeline_stages').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
