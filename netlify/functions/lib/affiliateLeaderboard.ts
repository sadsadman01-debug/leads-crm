import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

export type LeaderboardPeriod = 'this_month' | 'this_quarter' | 'all_time'

/** ISO lower bound for the selected period, or null for all-time (no filter). */
function periodStart(period: LeaderboardPeriod): string | null {
  const now = new Date()
  if (period === 'this_month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }
  if (period === 'this_quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    return new Date(now.getFullYear(), quarterStartMonth, 1).toISOString()
  }
  return null
}

export interface LeaderboardRow {
  affiliate_id: string
  full_name: string
  email: string
  public_display_name: string | null
  leaderboard_opt_in: boolean
  completed: number
  commission_earned_usd: number
  rank: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Every active affiliate ranked by converted-referral count within the
 * period (ties broken by commission earned, then alphabetically) — one bulk
 * query per data source rather than N per-affiliate round trips, since this
 * covers every affiliate at once rather than a single one like
 * getAffiliateFunnel/getAffiliateBalances do. Standard competition ranking
 * (equal counts share a rank; the next distinct value resumes at its true
 * position), computed across ALL active affiliates regardless of their own
 * leaderboard_opt_in — callers are responsible for filtering which ROWS to
 * actually show a given viewer; rank numbers themselves are never re-based. */
export async function buildAffiliateLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardRow[]> {
  const supabase = getSupabaseAdmin()
  const since = periodStart(period)

  const { data: affiliates, error: affErr } = await supabase
    .from('affiliates')
    .select('id, full_name, email, public_display_name, leaderboard_opt_in, status')
    .eq('status', 'active')
  if (affErr) throw new HttpError(500, affErr.message)

  let orgsQuery = supabase
    .from('organizations')
    .select('referred_by_affiliate_id, first_payment_confirmed_at')
    .not('referred_by_affiliate_id', 'is', null)
    .not('first_payment_confirmed_at', 'is', null)
  if (since) orgsQuery = orgsQuery.gte('first_payment_confirmed_at', since)

  let commissionsQuery = supabase.from('affiliate_commissions').select('affiliate_id, commission_amount_usd, created_at')
  if (since) commissionsQuery = commissionsQuery.gte('created_at', since)

  const [{ data: orgs, error: orgsErr }, { data: commissions, error: commErr }] = await Promise.all([orgsQuery, commissionsQuery])
  if (orgsErr) throw new HttpError(500, orgsErr.message)
  if (commErr) throw new HttpError(500, commErr.message)

  const completedByAffiliate = new Map<string, number>()
  for (const o of orgs ?? []) {
    const id = o.referred_by_affiliate_id as string
    completedByAffiliate.set(id, (completedByAffiliate.get(id) ?? 0) + 1)
  }

  const earnedByAffiliate = new Map<string, number>()
  for (const c of commissions ?? []) {
    earnedByAffiliate.set(c.affiliate_id, (earnedByAffiliate.get(c.affiliate_id) ?? 0) + Number(c.commission_amount_usd))
  }

  const unranked = (affiliates ?? []).map((a) => ({
    affiliate_id: a.id as string,
    full_name: a.full_name as string,
    email: a.email as string,
    public_display_name: a.public_display_name as string | null,
    leaderboard_opt_in: a.leaderboard_opt_in as boolean,
    completed: completedByAffiliate.get(a.id) ?? 0,
    commission_earned_usd: round2(earnedByAffiliate.get(a.id) ?? 0),
  }))

  unranked.sort((a, b) => {
    if (b.completed !== a.completed) return b.completed - a.completed
    if (b.commission_earned_usd !== a.commission_earned_usd) return b.commission_earned_usd - a.commission_earned_usd
    return a.full_name.localeCompare(b.full_name)
  })

  const ranked: LeaderboardRow[] = []
  let rank = 0
  let lastCompleted: number | null = null
  for (let i = 0; i < unranked.length; i++) {
    const row = unranked[i]
    if (lastCompleted === null || row.completed !== lastCompleted) {
      rank = i + 1
      lastCompleted = row.completed
    }
    ranked.push({ ...row, rank })
  }

  return ranked
}
