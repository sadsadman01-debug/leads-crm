import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'

export async function listWinLossReasons() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('win_loss_reasons').select('id, label').order('label', { ascending: true })
  if (error) throw new HttpError(500, error.message)
  return json(200, { reasons: data ?? [] })
}

export async function createWinLossReason(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const label = (body.label ?? '').trim()
  if (!label) throw new HttpError(400, 'label is required')

  const { data, error } = await supabase.from('win_loss_reasons').insert({ label }).select('id, label').single()

  if (error) {
    if (error.code === '23505') throw new HttpError(400, `"${label}" already exists`)
    throw new HttpError(500, error.message)
  }
  return json(201, data)
}

export async function renameWinLossReason(id: string, event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
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

export async function deleteWinLossReason(id: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('win_loss_reasons').delete().eq('id', id)
  if (error) throw new HttpError(500, error.message)
  return json(200, { success: true })
}
