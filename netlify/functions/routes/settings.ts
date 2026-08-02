import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const CURRENCIES = [
  'USD', 'BDT', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'AED', 'SGD',
  'JPY', 'CNY', 'CHF', 'NZD', 'ZAR', 'BRL',
]

const SETTINGS_COLUMNS = 'id, default_currency'

/** Every organization (and the Super Admin's personal scope) gets its own
 * app_settings row, created lazily on first access rather than seeded upfront.
 * Follow-up cadence now lives entirely on outreach_sequence_stages
 * (see routes/outreachSequences.ts) — this row only holds default_currency. */
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
  return json(200, data)
}

export async function updateSettings(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}

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
    .select('default_currency')
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}
