import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

export interface AffiliateSettingsRow {
  id: string
  affiliate_program_enabled: boolean
  affiliate_first_payment_commission_pct: number
  affiliate_recurring_commission_pct: number
  affiliate_recurring_duration_type: 'lifetime' | 'capped'
  affiliate_recurring_duration_count: number | null
  affiliate_min_withdrawal_usd: number | null
  affiliate_program_terms: string | null
  affiliate_fb_post_template: string | null
  affiliate_email_subject_template: string | null
  affiliate_email_body_template: string | null
  affiliate_promo_headline: string | null
  affiliate_promo_subheadline: string | null
}

const AFFILIATE_SETTINGS_COLUMNS =
  'id, affiliate_program_enabled, affiliate_first_payment_commission_pct, affiliate_recurring_commission_pct, ' +
  'affiliate_recurring_duration_type, affiliate_recurring_duration_count, affiliate_min_withdrawal_usd, ' +
  'affiliate_program_terms, affiliate_fb_post_template, affiliate_email_subject_template, affiliate_email_body_template, ' +
  'affiliate_promo_headline, affiliate_promo_subheadline'

/** Single platform-wide row, shared with Platform Branding/Billing Settings
 * (same `platform_settings` table) — created lazily on first access. */
export async function getOrCreateAffiliateSettingsRow(): Promise<AffiliateSettingsRow> {
  const supabase = getSupabaseAdmin()
  const { data: existing, error } = await supabase
    .from('platform_settings')
    .select(AFFILIATE_SETTINGS_COLUMNS)
    .limit(1)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (existing) return existing as any as AffiliateSettingsRow

  const { data: created, error: createErr } = await supabase
    .from('platform_settings')
    .insert({})
    .select(AFFILIATE_SETTINGS_COLUMNS)
    .single()
  if (createErr) throw new HttpError(500, createErr.message)
  return created as any as AffiliateSettingsRow
}

/** Substitutes {{affiliate_name}}, {{referral_link}}, {{price}}, and
 * {{platform_name}} merge fields — used for both the Facebook Post and
 * Email templates, server-side, so the affiliate never sees raw template syntax. */
export function renderTemplate(
  template: string | null,
  fields: { affiliate_name: string; referral_link: string; price: string; platform_name: string }
): string {
  if (!template) return ''
  return template
    .replace(/\{\{\s*affiliate_name\s*\}\}/g, fields.affiliate_name)
    .replace(/\{\{\s*referral_link\s*\}\}/g, fields.referral_link)
    .replace(/\{\{\s*price\s*\}\}/g, fields.price)
    .replace(/\{\{\s*platform_name\s*\}\}/g, fields.platform_name)
}
