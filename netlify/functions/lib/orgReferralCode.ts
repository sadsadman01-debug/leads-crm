import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

/** Mirrors generateUniqueReferralCode (Affiliate Program) exactly, checked
 * against organizations.org_referral_code instead of affiliates.referral_code
 * — kept as a separate function/column rather than sharing, per this
 * feature's explicit separation from the Affiliate Program. */
export async function generateUniqueOrgReferralCode(): Promise<string> {
  const supabase = getSupabaseAdmin()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
    const { data, error } = await supabase.from('organizations').select('id').eq('org_referral_code', code).maybeSingle()
    if (error) throw new HttpError(500, error.message)
    if (!data) return code
  }
  throw new HttpError(500, 'Could not generate a unique referral code — please try again')
}
