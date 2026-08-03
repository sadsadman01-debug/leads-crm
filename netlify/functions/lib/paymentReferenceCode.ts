import crypto from 'crypto'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

// Excludes visually ambiguous characters (I/l/1, O/0) — this code is meant to
// be manually typed by the payer into their bKash/bank transfer's reference
// field, and misread by the Super Admin cross-checking it against their own
// payment app matters far more here than for a machine-consumed token.
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 9

function randomCode(): string {
  let code = ''
  for (let i = 0; i < LENGTH; i++) code += CHARSET[crypto.randomInt(CHARSET.length)]
  return code
}

/** Distinct in purpose from `payment_token` (long, unguessable, used only to
 * secure the /pay page URL) — this is the short, human-typable code the
 * payer includes as a reference/note when actually sending money. Each
 * payment instance (a signup_requests row, or a renewal_payment_requests
 * row) gets its own code checked for uniqueness against that same table,
 * with a retry-on-collision loop mirroring generateUniqueReferralCode. */
export async function generateUniquePaymentReferenceCode(table: 'signup_requests' | 'renewal_payment_requests'): Promise<string> {
  const supabase = getSupabaseAdmin()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    const { data, error } = await supabase.from(table).select('id').eq('payment_reference_code', code).maybeSingle()
    if (error) throw new HttpError(500, error.message)
    if (!data) return code
  }
  throw new HttpError(500, 'Could not generate a unique payment reference code — please try again')
}
