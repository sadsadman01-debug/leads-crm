import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

export interface OrgReferralSettingsRow {
  id: string
  org_referral_program_enabled: boolean
  org_referral_reward_months: number
  org_referral_max_rewards: number | null
  org_referral_terms: string | null
}

const ORG_REFERRAL_SETTINGS_COLUMNS =
  'id, org_referral_program_enabled, org_referral_reward_months, org_referral_max_rewards, org_referral_terms'

/** Single platform-wide row, shared with Billing/Affiliate Program Settings
 * (same `platform_settings` table) — created lazily on first access. */
export async function getOrCreateOrgReferralSettingsRow(): Promise<OrgReferralSettingsRow> {
  const supabase = getSupabaseAdmin()
  const { data: existing, error } = await supabase
    .from('platform_settings')
    .select(ORG_REFERRAL_SETTINGS_COLUMNS)
    .limit(1)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (existing) return existing as any as OrgReferralSettingsRow

  const { data: created, error: createErr } = await supabase
    .from('platform_settings')
    .insert({})
    .select(ORG_REFERRAL_SETTINGS_COLUMNS)
    .single()
  if (createErr) throw new HttpError(500, createErr.message)
  return created as any as OrgReferralSettingsRow
}
