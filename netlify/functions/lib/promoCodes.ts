import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'
import type { BillingSettingsRow } from './billingSettings.js'

export interface PromoCodeRow {
  id: string
  code: string
  discount_type: 'flat' | 'percent'
  discount_value: number
  is_active: boolean
  times_used: number
  max_uses: number | null
  expires_at: string | null
}

export type PromoCodeCheckResult = { ok: true; promo: PromoCodeRow } | { ok: false; reason: string }

const PROMO_LOOKUP_COLUMNS = 'id, code, discount_type, discount_value, is_active, times_used, max_uses, expires_at'

/** Single source of truth for "can this code be applied right now" — used by
 * both the public validate-on-Apply endpoint and the authoritative check at
 * signup submission, so the two can never drift out of sync. Checks in the
 * order the rejection message should be prioritized: active, usage limit,
 * expiry, then Early Bird exclusion. */
export async function checkPromoCode(codeInput: string, settings: BillingSettingsRow, isEarlyBird: boolean): Promise<PromoCodeCheckResult> {
  const supabase = getSupabaseAdmin()
  const code = codeInput.trim().toUpperCase()

  const { data, error } = await supabase.from('promo_codes').select(PROMO_LOOKUP_COLUMNS).eq('code', code).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data || !data.is_active) return { ok: false, reason: 'This promo code is invalid or no longer active' }
  if (data.max_uses != null && data.times_used >= data.max_uses) return { ok: false, reason: 'This promo code has reached its usage limit' }
  if (data.expires_at != null && new Date() > new Date(data.expires_at)) return { ok: false, reason: 'This promo code has expired' }
  if (isEarlyBird) {
    return {
      ok: false,
      reason: `Promo codes cannot be combined with Early Bird pricing (৳${settings.early_bird_price_usd}/mo). This code will work once Standard pricing (৳${settings.standard_price_usd}/mo) begins.`,
    }
  }

  return { ok: true, promo: data as PromoCodeRow }
}
