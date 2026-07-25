import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR']

export async function getSettings() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('app_settings')
    .select('follow_up_interval_days, default_currency')
    .eq('id', 1)
    .single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

export async function updateSettings(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}

  if ('follow_up_interval_days' in body) {
    const days = Number(body.follow_up_interval_days)
    if (!Number.isInteger(days) || days <= 0) {
      throw new HttpError(400, 'follow_up_interval_days must be a positive integer')
    }
    update.follow_up_interval_days = days
  }

  if ('default_currency' in body) {
    if (!CURRENCIES.includes(body.default_currency)) {
      throw new HttpError(400, `default_currency must be one of: ${CURRENCIES.join(', ')}`)
    }
    update.default_currency = body.default_currency
  }

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase
    .from('app_settings')
    .update(update)
    .eq('id', 1)
    .select('follow_up_interval_days, default_currency')
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
