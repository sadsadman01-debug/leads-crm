import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

export interface AffiliateBalances {
  lifetimeEarned: number
  thisMonthEarned: number
  totalPaidOut: number
  pendingWithdrawal: number
  availableBalance: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** The five balance figures shown on the Affiliate Dashboard — computed
 * fresh on every read (no cached running total to drift out of sync). Also
 * the basis for the min-withdrawal check on the create-withdrawal path (the
 * actual max-balance/race-safety check happens inside the
 * request_affiliate_withdrawal Postgres function, not here). */
export async function getAffiliateBalances(affiliateId: string): Promise<AffiliateBalances> {
  const supabase = getSupabaseAdmin()

  const { data: commissions, error: commErr } = await supabase
    .from('affiliate_commissions')
    .select('commission_amount_usd, created_at')
    .eq('affiliate_id', affiliateId)
  if (commErr) throw new HttpError(500, commErr.message)

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  let lifetimeEarned = 0
  let thisMonthEarned = 0
  for (const c of commissions ?? []) {
    const amount = Number(c.commission_amount_usd)
    lifetimeEarned += amount
    if (new Date(c.created_at) >= startOfMonth) thisMonthEarned += amount
  }

  const { data: withdrawals, error: wErr } = await supabase
    .from('withdrawal_requests')
    .select('amount_usd, actual_amount_sent_usd, status')
    .eq('affiliate_id', affiliateId)
  if (wErr) throw new HttpError(500, wErr.message)

  let totalPaidOut = 0
  let pendingWithdrawal = 0
  for (const w of withdrawals ?? []) {
    if (w.status === 'approved') {
      totalPaidOut += Number(w.actual_amount_sent_usd ?? w.amount_usd)
    } else if (w.status === 'pending' || w.status === 'processing') {
      pendingWithdrawal += Number(w.amount_usd)
    }
  }

  const availableBalance = lifetimeEarned - totalPaidOut - pendingWithdrawal

  return {
    lifetimeEarned: round2(lifetimeEarned),
    thisMonthEarned: round2(thisMonthEarned),
    totalPaidOut: round2(totalPaidOut),
    pendingWithdrawal: round2(pendingWithdrawal),
    availableBalance: round2(availableBalance),
  }
}

export interface FunnelCounts {
  clicks: number
  requests: number
  completed: number
}

/** Clicks -> Signup Requests Submitted -> Signups Completed, optionally
 * scoped to a date range (all three stages filtered by the SAME range, each
 * against its own natural date column). */
export async function getAffiliateFunnel(affiliateId: string, dateFrom?: string, dateTo?: string): Promise<FunnelCounts> {
  const supabase = getSupabaseAdmin()

  let clicksQuery = supabase.from('referral_clicks').select('id', { count: 'exact', head: true }).eq('affiliate_id', affiliateId)
  if (dateFrom) clicksQuery = clicksQuery.gte('clicked_at', dateFrom)
  if (dateTo) clicksQuery = clicksQuery.lte('clicked_at', dateTo)

  let requestsQuery = supabase.from('signup_requests').select('id', { count: 'exact', head: true }).eq('referred_by_affiliate_id', affiliateId)
  if (dateFrom) requestsQuery = requestsQuery.gte('requested_at', dateFrom)
  if (dateTo) requestsQuery = requestsQuery.lte('requested_at', dateTo)

  let completedQuery = supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by_affiliate_id', affiliateId)
    .not('first_payment_confirmed_at', 'is', null)
  if (dateFrom) completedQuery = completedQuery.gte('first_payment_confirmed_at', dateFrom)
  if (dateTo) completedQuery = completedQuery.lte('first_payment_confirmed_at', dateTo)

  const [{ count: clicks, error: e1 }, { count: requests, error: e2 }, { count: completed, error: e3 }] = await Promise.all([
    clicksQuery,
    requestsQuery,
    completedQuery,
  ])
  if (e1) throw new HttpError(500, e1.message)
  if (e2) throw new HttpError(500, e2.message)
  if (e3) throw new HttpError(500, e3.message)

  return { clicks: clicks ?? 0, requests: requests ?? 0, completed: completed ?? 0 }
}

/** Daily click/request counts within the range, for the momentum trend chart. */
export async function getAffiliateTrend(affiliateId: string, dateFrom: string, dateTo: string) {
  const supabase = getSupabaseAdmin()
  const [{ data: clicks, error: e1 }, { data: requests, error: e2 }] = await Promise.all([
    supabase.from('referral_clicks').select('clicked_at').eq('affiliate_id', affiliateId).gte('clicked_at', dateFrom).lte('clicked_at', dateTo),
    supabase.from('signup_requests').select('requested_at').eq('referred_by_affiliate_id', affiliateId).gte('requested_at', dateFrom).lte('requested_at', dateTo),
  ])
  if (e1) throw new HttpError(500, e1.message)
  if (e2) throw new HttpError(500, e2.message)

  const byDay = new Map<string, { clicks: number; requests: number }>()
  for (const c of clicks ?? []) {
    const day = c.clicked_at.slice(0, 10)
    const entry = byDay.get(day) ?? { clicks: 0, requests: 0 }
    entry.clicks += 1
    byDay.set(day, entry)
  }
  for (const r of requests ?? []) {
    const day = r.requested_at.slice(0, 10)
    const entry = byDay.get(day) ?? { clicks: 0, requests: 0 }
    entry.requests += 1
    byDay.set(day, entry)
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }))
}
