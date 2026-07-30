import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import { getAffiliateBalances, getAffiliateFunnel, getAffiliateTrend } from '../lib/affiliateBalances.js'
import { getOrCreateAffiliateSettingsRow } from '../lib/affiliateSettings.js'
import type { AuthedUser } from '../lib/auth.js'

const AFFILIATE_COLUMNS = 'id, profile_id, full_name, email, referral_code, status, created_at'

export async function getAffiliateForUser(user: AuthedUser) {
  if (user.role !== 'affiliate') throw new HttpError(403, 'Affiliate access required')
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('affiliates').select(AFFILIATE_COLUMNS).eq('profile_id', user.id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Affiliate profile not found')
  return data
}

function parseDateRange(event: HandlerEvent) {
  const params = event.queryStringParameters ?? {}
  return { dateFrom: params.dateFrom || undefined, dateTo: params.dateTo || undefined }
}

export async function getMyAffiliateProfile(user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  return json(200, affiliate)
}

/** Everything the Affiliate Dashboard's Overview tab needs in one call:
 * balances, this-month-vs-last-month comparison, and the funnel + trend for
 * whichever date range was requested. */
export async function getMyDashboardSummary(event: HandlerEvent, user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const balances = await getAffiliateBalances(affiliate.id)
  const { dateFrom, dateTo } = parseDateRange(event)
  const funnel = await getAffiliateFunnel(affiliate.id, dateFrom, dateTo)
  const trend = dateFrom && dateTo ? await getAffiliateTrend(affiliate.id, dateFrom, dateTo) : []

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const supabase = getSupabaseAdmin()
  const { data: lastMonthCommissions, error } = await supabase
    .from('affiliate_commissions')
    .select('commission_amount_usd')
    .eq('affiliate_id', affiliate.id)
    .gte('created_at', startOfLastMonth.toISOString())
    .lt('created_at', startOfThisMonth.toISOString())
  if (error) throw new HttpError(500, error.message)
  const lastMonthEarned = (lastMonthCommissions ?? []).reduce((sum, c) => sum + Number(c.commission_amount_usd), 0)
  const settings = await getOrCreateAffiliateSettingsRow()

  return json(200, {
    affiliate,
    balances,
    lastMonthEarned: Math.round(lastMonthEarned * 100) / 100,
    funnel,
    trend,
    minWithdrawalUsd: settings.affiliate_min_withdrawal_usd,
  })
}

/** Referred Organizations with status + commission earned from each — the
 * Affiliate Dashboard's "Referrals" table. */
export async function listMyReferrals(user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const supabase = getSupabaseAdmin()

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, status, created_at, first_payment_confirmed_at')
    .eq('referred_by_affiliate_id', affiliate.id)
    .order('created_at', { ascending: false })
  if (error) throw new HttpError(500, error.message)

  const orgIds = (orgs ?? []).map((o) => o.id)
  const { data: commissions } =
    orgIds.length > 0
      ? await supabase.from('affiliate_commissions').select('organization_id, commission_amount_usd').in('organization_id', orgIds)
      : { data: [] as any[] }

  const earnedByOrg = new Map<string, number>()
  for (const c of commissions ?? []) {
    earnedByOrg.set(c.organization_id, (earnedByOrg.get(c.organization_id) ?? 0) + Number(c.commission_amount_usd))
  }

  return json(200, {
    referrals: (orgs ?? []).map((o) => ({
      ...o,
      commission_earned_usd: Math.round((earnedByOrg.get(o.id) ?? 0) * 100) / 100,
    })),
  })
}

/** Super Admin only — every affiliate, with earnings + funnel summary
 * columns for at-a-glance comparison. */
export async function listAffiliates(user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data: affiliates, error } = await supabase.from('affiliates').select(AFFILIATE_COLUMNS).order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)

  const rows = await Promise.all(
    (affiliates ?? []).map(async (a) => {
      const [balances, funnel] = await Promise.all([getAffiliateBalances(a.id), getAffiliateFunnel(a.id)])
      return { ...a, balances, funnel }
    })
  )

  return json(200, { affiliates: rows })
}

/** Super Admin only — single affiliate's full profile plus the same
 * funnel/trend data the affiliate sees on their own dashboard, for auditing. */
export async function getAffiliateDetail(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const { data: affiliate, error } = await supabase.from('affiliates').select(AFFILIATE_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!affiliate) throw new HttpError(404, 'Affiliate not found')

  const balances = await getAffiliateBalances(id)
  const { dateFrom, dateTo } = parseDateRange(event)
  const funnel = await getAffiliateFunnel(id, dateFrom, dateTo)
  const trend = dateFrom && dateTo ? await getAffiliateTrend(id, dateFrom, dateTo) : []

  return json(200, { affiliate, balances, funnel, trend })
}

/** Super Admin only — suspend/reactivate an affiliate account (blocks/allows
 * login the same way Organization suspension already does for Admins/Users,
 * via banning the underlying Auth user). Body: { status: 'active' | 'suspended' }. */
export async function updateAffiliateStatus(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  if (!['active', 'suspended'].includes(body.status)) throw new HttpError(400, "status must be 'active' or 'suspended'")

  const { data: affiliate, error: fetchErr } = await supabase.from('affiliates').select('id, profile_id').eq('id', id).maybeSingle()
  if (fetchErr) throw new HttpError(500, fetchErr.message)
  if (!affiliate) throw new HttpError(404, 'Affiliate not found')

  const isActive = body.status === 'active'
  await supabase.from('profiles').update({ is_active: isActive }).eq('id', affiliate.profile_id)
  await supabase.auth.admin.updateUserById(affiliate.profile_id, { ban_duration: isActive ? 'none' : '876000h' })

  const { data, error } = await supabase.from('affiliates').update({ status: body.status }).eq('id', id).select(AFFILIATE_COLUMNS).single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}
