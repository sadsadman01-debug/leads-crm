import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireAdminOrAbove, resolveOrganizationId } from '../lib/permissions.js'
import type { ReminderChannel } from '../lib/reminders.js'
import type { AuthedUser } from '../lib/auth.js'

const CURRENCIES = [
  'USD', 'BDT', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'AED', 'SGD',
  'JPY', 'CNY', 'CHF', 'NZD', 'ZAR', 'BRL',
]

const INTERVAL_FIELDS = [
  'email_followup1_interval_days',
  'email_followup2_interval_days',
  'email_followup3_interval_days',
  'whatsapp_followup1_interval_days',
  'whatsapp_followup2_interval_days',
  'whatsapp_followup3_interval_days',
  'linkedin_followup1_interval_days',
  'linkedin_followup2_interval_days',
  'linkedin_followup3_interval_days',
] as const

// Written out as string literals (rather than INTERVAL_FIELDS.join(', ')) so
// Supabase's query builder can infer the selected row shape — Array.join()
// always returns a widened `string`, which would make every field come back
// typed as `unknown`.
const SETTINGS_FIELDS =
  'email_followup1_interval_days, email_followup2_interval_days, email_followup3_interval_days, ' +
  'whatsapp_followup1_interval_days, whatsapp_followup2_interval_days, whatsapp_followup3_interval_days, ' +
  'linkedin_followup1_interval_days, linkedin_followup2_interval_days, linkedin_followup3_interval_days, default_currency'
const SETTINGS_COLUMNS = `id, ${SETTINGS_FIELDS}`

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
  return json(200, data)
}

export async function updateSettings(event: HandlerEvent, user: AuthedUser) {
  requireAdminOrAbove(user)
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const body = JSON.parse(event.body || '{}')

  const update: Record<string, any> = {}

  for (const field of INTERVAL_FIELDS) {
    if (field in body) {
      const days = Number(body[field])
      if (!Number.isInteger(days) || days <= 0) {
        throw new HttpError(400, `${field} must be a positive integer`)
      }
      update[field] = days
    }
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
    .select(SETTINGS_FIELDS)
    .single()

  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Reads the configured interval for one channel/stage — used by
 * updateLeadStatus when a "sent" toggle flips true and needs to compute the
 * next follow-up's due date. */
export async function getFollowUpIntervalDays(
  organizationId: string | null,
  channel: ReminderChannel,
  stage: 1 | 2 | 3
): Promise<number> {
  const data: any = await getOrCreateSettingsRow(organizationId)
  return data[`${channel}_followup${stage}_interval_days`]
}
