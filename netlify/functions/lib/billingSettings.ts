import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

export interface BillingSettingsRow {
  id: string
  payment_instructions: string | null
  early_bird_threshold: number
  early_bird_price_usd: number
  standard_price_usd: number
}

const BILLING_COLUMNS = 'id, payment_instructions, early_bird_threshold, early_bird_price_usd, standard_price_usd'

/** Single platform-wide row, shared with Platform Branding (same
 * `platform_settings` table) — created lazily on first access. */
export async function getOrCreateBillingSettingsRow(): Promise<BillingSettingsRow> {
  const supabase = getSupabaseAdmin()
  const { data: existing, error } = await supabase
    .from('platform_settings')
    .select(BILLING_COLUMNS)
    .limit(1)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (existing) return existing

  const { data: created, error: createErr } = await supabase
    .from('platform_settings')
    .insert({})
    .select(BILLING_COLUMNS)
    .single()
  if (createErr) throw new HttpError(500, createErr.message)
  return created
}

export interface PricingTierResult {
  pricing_tier: 'early_bird' | 'standard'
  monthly_price_usd: number
  spots_remaining: number
}

/** Counts ALL organizations ever created (active, suspended, or since-deleted
 * rows no longer exist to count — deletion is permanent in this app, so this
 * is simply every currently-existing row) to decide whether the Early Bird
 * tier still applies. Simple `count` query, no complex logic. */
export async function computeCurrentPricingTier(settings: BillingSettingsRow): Promise<PricingTierResult> {
  const supabase = getSupabaseAdmin()
  const { count, error } = await supabase.from('organizations').select('id', { count: 'exact', head: true })
  if (error) throw new HttpError(500, error.message)
  const orgCount = count ?? 0
  const spotsRemaining = Math.max(0, settings.early_bird_threshold - orgCount)

  if (spotsRemaining > 0) {
    return { pricing_tier: 'early_bird', monthly_price_usd: Number(settings.early_bird_price_usd), spots_remaining: spotsRemaining }
  }
  return { pricing_tier: 'standard', monthly_price_usd: Number(settings.standard_price_usd), spots_remaining: 0 }
}
