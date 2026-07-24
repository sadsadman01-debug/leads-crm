import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'

export async function getSettings() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('app_settings').select('follow_up_interval_days').eq('id', 1).single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

export async function updateSettings(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const days = Number(body.follow_up_interval_days)

  if (!Number.isInteger(days) || days <= 0) {
    throw new HttpError(400, 'follow_up_interval_days must be a positive integer')
  }

  const { data, error } = await supabase
    .from('app_settings')
    .update({ follow_up_interval_days: days })
    .eq('id', 1)
    .select('follow_up_interval_days')
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Reads the current interval without wrapping it in an HTTP response — used by status-update logic. */
export async function getFollowUpIntervalDays(): Promise<number> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('app_settings').select('follow_up_interval_days').eq('id', 1).single()
  if (error) throw new HttpError(500, error.message)
  return data.follow_up_interval_days
}
