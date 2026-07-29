import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

export interface BillingSettingsRow {
  id: string
  payment_instructions: string | null
  early_bird_threshold: number
  early_bird_price_usd: number
  standard_price_usd: number
  promotional_banner_text: string | null
  grace_period_days: number
}

const BILLING_COLUMNS =
  'id, payment_instructions, early_bird_threshold, early_bird_price_usd, standard_price_usd, promotional_banner_text, grace_period_days'

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

export type BillingCycle = 'monthly' | 'annual'

/** 20% off the full annual total, available at every pricing tier. */
export function computeAnnualTotal(monthlyPriceUsd: number): number {
  return Math.round(monthlyPriceUsd * 12 * 0.8 * 100) / 100
}

export interface PricingTierResult {
  pricing_tier: 'early_bird' | 'standard'
  monthly_price_usd: number
  annual_total_usd: number
  spots_remaining: number
}

/** Counts ALL organizations ever created (active, suspended, or since-deleted
 * rows no longer exist to count — deletion is permanent in this app, so this
 * is simply every currently-existing row) to decide whether the Early Bird
 * tier still applies. Simple `count` query, no complex logic. Once granted,
 * a specific Organization's tier/price is locked onto its own row forever —
 * this function only ever computes the CURRENT tier for a brand-new request. */
export async function computeCurrentPricingTier(settings: BillingSettingsRow): Promise<PricingTierResult> {
  const supabase = getSupabaseAdmin()
  const { count, error } = await supabase.from('organizations').select('id', { count: 'exact', head: true })
  if (error) throw new HttpError(500, error.message)
  const orgCount = count ?? 0
  const spotsRemaining = Math.max(0, settings.early_bird_threshold - orgCount)

  const monthlyPrice = spotsRemaining > 0 ? Number(settings.early_bird_price_usd) : Number(settings.standard_price_usd)
  return {
    pricing_tier: spotsRemaining > 0 ? 'early_bird' : 'standard',
    monthly_price_usd: monthlyPrice,
    annual_total_usd: computeAnnualTotal(monthlyPrice),
    spots_remaining: spotsRemaining,
  }
}

/** Parses the Super Admin's freeform "Benefits" text into a bullet list —
 * one bullet per non-empty line, matching the plain-textarea editing pattern
 * already used for Payment Instructions elsewhere in this feature. */
export function parseBenefitsList(text: string | null): string[] {
  if (!text) return []
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
}

export function addBillingPeriod(dateStr: string, cycle: BillingCycle): string {
  const d = new Date(dateStr)
  if (cycle === 'annual') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString().slice(0, 10)
}
