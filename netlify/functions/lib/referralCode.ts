import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

/** 8-character, human-typeable code (uppercase letters + digits). Collisions
 * are astronomically unlikely at this scale, but this still checks and
 * retries a few times rather than trusting that alone. */
export async function generateUniqueReferralCode(): Promise<string> {
  const supabase = getSupabaseAdmin()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
    const { data, error } = await supabase.from('affiliates').select('id').eq('referral_code', code).maybeSingle()
    if (error) throw new HttpError(500, error.message)
    if (!data) return code
  }
  throw new HttpError(500, 'Could not generate a unique referral code — please try again')
}
