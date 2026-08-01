import type { HandlerEvent } from '@netlify/functions'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { getClientIp } from '../lib/auditLog.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

const PAGE_TYPES = new Set(['request_access', 'become_affiliate'])

// Same throttle shape as support_contacts' pre-auth endpoint — generous
// enough that real repeat visits are never dropped, just enough to keep a
// single visitor (or a bot) from inflating the count.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const RATE_LIMIT_MAX = 20

/** Never stores the raw IP — same pepper/hash convention as referral_clicks. */
function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'leads-crm'
  return createHash('sha256').update(`${pepper}:${ip}`).digest('hex')
}

/** POST /page-views — public, unauthenticated, fire-and-forget from the
 * Request Access / Become an Affiliate pages. Logged on every page load,
 * before the visitor necessarily submits anything, regardless of whether a
 * referral code is present — this is the platform-wide aggregate view;
 * referral_clicks remains the per-affiliate source of truth. */
export async function logPageView(event: HandlerEvent) {
  const body = JSON.parse(event.body || '{}')
  const pageType = (body.page_type ?? '').trim()
  if (!PAGE_TYPES.has(pageType)) throw new HttpError(400, 'Invalid page_type')

  const referralCode = (body.referral_code ?? '').trim() || null
  const ip = getClientIp(event)
  const ipHash = hashIp(ip)
  const supabase = getSupabaseAdmin()

  if (ipHash) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('page_views')
      .select('id', { count: 'exact', head: true })
      .eq('page_type', pageType)
      .eq('ip_hash', ipHash)
      .gte('viewed_at', since)
    // Over the throttle — silently no-op. This is a passive tracking beacon,
    // not a form submission, so there's nothing useful to tell the client.
    if ((count ?? 0) >= RATE_LIMIT_MAX) return json(200, { success: true })
  }

  await supabase.from('page_views').insert({
    page_type: pageType,
    ip_hash: ipHash,
    referral_code: referralCode,
  })

  return json(200, { success: true })
}

/** GET /page-views/count — Super Admin only. Platform-level oversight data,
 * never visible to Admins/Users/Affiliates. */
export async function getPageViewCount(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)

  const pageType = (event.queryStringParameters?.page_type ?? '').trim()
  if (!PAGE_TYPES.has(pageType)) throw new HttpError(400, 'Invalid page_type')
  const dateFrom = event.queryStringParameters?.dateFrom
  const dateTo = event.queryStringParameters?.dateTo

  const supabase = getSupabaseAdmin()
  let query = supabase.from('page_views').select('id', { count: 'exact', head: true }).eq('page_type', pageType)
  if (dateFrom) query = query.gte('viewed_at', dateFrom)
  if (dateTo) query = query.lte('viewed_at', dateTo)

  const { count, error } = await query
  if (error) throw new HttpError(500, error.message)

  return json(200, { count: count ?? 0 })
}
