import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdminOrStaff, isStaff } from '../lib/permissions.js'
import { getAffiliateBalances, getAffiliateFunnel, getAffiliateTrend, type AffiliateBalances } from '../lib/affiliateBalances.js'
import { getOrCreateAffiliateSettingsRow } from '../lib/affiliateSettings.js'
import { buildAffiliateLeaderboard, type LeaderboardPeriod } from '../lib/affiliateLeaderboard.js'
import type { AuthedUser } from '../lib/auth.js'

const AFFILIATE_COLUMNS =
  'id, profile_id, full_name, email, referral_code, city, country, zip_code, status, created_at, public_display_name, leaderboard_opt_in'

/** Staff has full view+act access to this screen EXCEPT monetary figures —
 * Total Earned/Pending/Paid Out (and per-affiliate commission) are masked
 * server-side, never sent to the browser at all, rather than merely hidden
 * by frontend CSS. Non-financial fields (referral/conversion counts, status)
 * are untouched. Withdrawal Requests is a separate screen and is NOT masked
 * — Staff needs real amounts there to actually process a withdrawal. */
function maskBalancesForStaff(balances: AffiliateBalances, user: AuthedUser): AffiliateBalances | null {
  if (!isStaff(user)) return balances
  return null
}

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

/** Body: { public_display_name?, leaderboard_opt_in? } — the only two fields
 * an Affiliate can self-edit. public_display_name blank/null clears back to
 * showing their real full_name to other affiliates on the leaderboard. */
export async function updateMyAffiliateProfile(event: HandlerEvent, user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const update: Record<string, any> = {}

  if ('public_display_name' in body) {
    update.public_display_name = (body.public_display_name ?? '').trim() || null
  }
  if ('leaderboard_opt_in' in body) {
    update.leaderboard_opt_in = Boolean(body.leaderboard_opt_in)
  }
  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase.from('affiliates').update(update).eq('id', affiliate.id).select(AFFILIATE_COLUMNS).single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

const LEADERBOARD_TOP_N = 10
const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ['this_month', 'this_quarter', 'all_time']

function parsePeriod(event: HandlerEvent): LeaderboardPeriod {
  const raw = event.queryStringParameters?.period
  return (LEADERBOARD_PERIODS as string[]).includes(raw ?? '') ? (raw as LeaderboardPeriod) : 'all_time'
}

/** Any authenticated Affiliate — the top N converted-referral ranks for the
 * selected period, privacy-filtered for OTHER affiliates (real name only
 * shown as their own public_display_name-or-full_name, commission never
 * shown, and any row belonging to an affiliate who's opted out of the public
 * leaderboard is simply omitted — not replaced with an anonymous
 * placeholder). The caller's own row is always included in `myEntry` (their
 * real stats, always visible to themselves regardless of their own opt-out),
 * and is also included in `topEntries` if their rank happens to fall within
 * the top N, even if they've personally opted out — opting out only ever
 * hides you from OTHER affiliates, never from your own view. */
export async function getAffiliateLeaderboard(event: HandlerEvent, user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const period = parsePeriod(event)
  const rows = await buildAffiliateLeaderboard(period)

  const myRow = rows.find((r) => r.affiliate_id === affiliate.id) ?? null

  const topEntries = rows
    .slice(0, LEADERBOARD_TOP_N)
    .filter((r) => r.leaderboard_opt_in || r.affiliate_id === affiliate.id)
    .map((r) => ({
      affiliate_id: r.affiliate_id,
      rank: r.rank,
      display_name: r.public_display_name || r.full_name,
      completed: r.completed,
      commission_earned_usd: r.affiliate_id === affiliate.id ? r.commission_earned_usd : null,
      is_self: r.affiliate_id === affiliate.id,
    }))

  const myEntry = myRow
    ? {
        affiliate_id: myRow.affiliate_id,
        rank: myRow.rank,
        display_name: myRow.public_display_name || myRow.full_name,
        completed: myRow.completed,
        commission_earned_usd: myRow.commission_earned_usd,
        is_self: true,
      }
    : null

  return json(200, { period, topEntries, myEntry, totalRanked: rows.length })
}

/** Super Admin only — the same ranking, every affiliate, no privacy
 * filtering (real name, email, and exact commission for everyone) and no
 * top-N cap, since this is for full oversight rather than peer motivation. */
export async function getAffiliateLeaderboardAdmin(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdminOrStaff(user)
  const period = parsePeriod(event)
  const rows = await buildAffiliateLeaderboard(period)
  const entries = rows.map((r) => (isStaff(user) ? { ...r, commission_earned_usd: null } : r))
  return json(200, { period, entries })
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
  requireSuperAdminOrStaff(user)
  const supabase = getSupabaseAdmin()
  const { data: affiliates, error } = await supabase.from('affiliates').select(AFFILIATE_COLUMNS).order('created_at', { ascending: true })
  if (error) throw new HttpError(500, error.message)

  const rows = await Promise.all(
    (affiliates ?? []).map(async (a) => {
      const [balances, funnel] = await Promise.all([getAffiliateBalances(a.id), getAffiliateFunnel(a.id)])
      return { ...a, balances: maskBalancesForStaff(balances, user), funnel }
    })
  )

  return json(200, { affiliates: rows })
}

/** Super Admin only — single affiliate's full profile plus the same
 * funnel/trend data the affiliate sees on their own dashboard, for auditing. */
export async function getAffiliateDetail(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdminOrStaff(user)
  const supabase = getSupabaseAdmin()
  const { data: affiliate, error } = await supabase.from('affiliates').select(AFFILIATE_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!affiliate) throw new HttpError(404, 'Affiliate not found')

  const balances = await getAffiliateBalances(id)
  const { dateFrom, dateTo } = parseDateRange(event)
  const funnel = await getAffiliateFunnel(id, dateFrom, dateTo)
  const trend = dateFrom && dateTo ? await getAffiliateTrend(id, dateFrom, dateTo) : []

  return json(200, { affiliate, balances: maskBalancesForStaff(balances, user), funnel, trend })
}

/** Staff (per spec, full access) or Super Admin — suspend/reactivate an
 * affiliate account (blocks/allows login the same way Organization
 * suspension already does for Admins/Users, via banning the underlying Auth
 * user). Body: { status: 'active' | 'suspended' }. */
export async function updateAffiliateStatus(id: string, event: HandlerEvent, user: AuthedUser) {
  requireSuperAdminOrStaff(user)
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
