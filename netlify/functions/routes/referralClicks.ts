import type { HandlerEvent } from '@netlify/functions'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { getClientIp } from '../lib/auditLog.js'

/** Never stores the raw IP — peppered with the service-role key (an existing
 * secret, so no new env var needed) before hashing, purely for basic
 * bot/duplicate-click filtering, not individual tracking. */
function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'leads-crm'
  return createHash('sha256').update(`${pepper}:${ip}`).digest('hex')
}

/** POST /referral-clicks — public, unauthenticated. Logged on every Request
 * Access page load with a valid ?ref=, BEFORE the visitor necessarily
 * submits anything — this is what makes the conversion funnel's "Link
 * Clicks" stage accurate rather than just inferred from eventual signups. */
export async function logReferralClick(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const referralCode = (body.referral_code ?? '').trim()
  if (!referralCode) throw new HttpError(400, 'referral_code is required')

  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id')
    .eq('referral_code', referralCode)
    .eq('status', 'active')
    .maybeSingle()

  // A stale/invalid/suspended code just silently no-ops — this endpoint
  // never reveals whether a code is valid, and never blocks page rendering.
  if (affiliate) {
    await supabase.from('referral_clicks').insert({
      affiliate_id: affiliate.id,
      ip_hash: hashIp(getClientIp(event)),
      user_agent: event.headers['user-agent'] || event.headers['User-Agent'] || null,
    })
  }

  return json(200, { success: true })
}
