import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const CURRENCIES = [
  'USD', 'BDT', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'AED', 'SGD',
  'JPY', 'CNY', 'CHF', 'NZD', 'ZAR', 'BRL',
]
const SETTINGS_COLUMNS = 'id, follow_up_interval_days, default_currency'

/** Every organization (and the Super Admin's personal scope) gets its own
 * app_settings row, created lazily on first access rather than seeded upfront. */
async function getOrCreateSettingsRow(organizationId: string | null) {
  const supabase = getSupabaseAdmin()
  let query = supabase.from('app_settings').select(SETTINGS_COLUMNS)
  query = organizationId === null ? query.is('organization_id', null) : query.eq('organization_id', organizationId)
  const { data: existing, error } = await query.maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (existing) return existing

  const { data: created, error: createErr } = await supabase
    .from('app_settings')
    .insert({ organization_id: organizationId })
    .select(SETTINGS_COLUMNS)
    .single()
  if (createErr) throw new HttpError(500, createErr.message)
  return created
}

export async function getSettings(event: HandlerEvent, user: AuthedUser) {
  const orgId = resolveOrganizationId(user, event)
  const data = await getOrCreateSettingsRow(orgId)
  return json(200, { follow_up_interval_days: data.follow_up_interval_days, default_currency: data.default_currency })
}

export async function updateSettings(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
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

  const row = await getOrCreateSettingsRow(orgId)
  const { data, error } = await supabase
    .from('app_settings')
    .update(update)
    .eq('id', row.id)
    .select('follow_up_interval_days, default_currency')
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Reads the current interval without wrapping it in an HTTP response — used by status-update logic. */
export async function getFollowUpIntervalDays(organizationId: string | null): Promise<number> {
  const data = await getOrCreateSettingsRow(organizationId)
  return data.follow_up_interval_days
}
