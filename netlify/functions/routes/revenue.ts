import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { isAdminOrAbove, resolveOrganizationId, scopeToOrg } from '../lib/permissions.js'
import { getOrRefreshRates, convertAmount } from '../lib/exchangeRates.js'
import type { AuthedUser } from '../lib/auth.js'

const MAX_DEALS_FOR_AGGREGATION = 20000

type ClosedRange = 'all' | 'month' | 'quarter' | 'year'

function pct(count: number, total: number): number {
  if (total === 0) return 0
  return Math.round((count / total) * 1000) / 10
}

function rangeStart(range: ClosedRange): Date | null {
  const now = new Date()
  if (range === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  if (range === 'quarter') return new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1))
  if (range === 'year') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  return null
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * All aggregate sums are converted into a single `displayCurrency` (the
 * organization's default, or an explicit ?displayCurrency= override) using the
 * cached ExchangeRate-API rates — see lib/exchangeRates.ts. Open deals convert
 * at the latest live rate (their value isn't finalized yet); closed deals use
 * the rate snapshot locked in at close time, so historical figures don't shift
 * as live rates move. Individual deals always keep their own original
 * currency/amount as the source of truth — conversion is a display-only layer.
 */
export async function getRevenueSummary(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const params = event.queryStringParameters ?? {}
  const industryId = params.industryId || undefined
  // Users only ever see their own deals, regardless of what the client sends.
  const assignedTo = isAdminOrAbove(user) ? params.assignedTo || undefined : user.id
  const closedRange: ClosedRange = (['all', 'month', 'quarter', 'year'] as const).includes(
    params.closedRange as ClosedRange
  )
    ? (params.closedRange as ClosedRange)
    : 'all'

  let stagesQuery = supabase.from('deal_stages').select('id, name, position, is_closed, is_won').order('position', { ascending: true })
  stagesQuery = scopeToOrg(stagesQuery as any, orgId) as any
  const { data: stages, error: stagesErr } = await stagesQuery
  if (stagesErr) throw new HttpError(500, stagesErr.message)

  let dealsQuery = supabase
    .from('deals')
    .select('id, name, value, currency, stage_id, probability, expected_close_date, actual_close_date, outcome_reason, created_at, lead_id, owner_id, closed_exchange_rate_snapshot, leads ( company_name, industry_id )')
    .order('created_at', { ascending: true })
    .limit(MAX_DEALS_FOR_AGGREGATION)
  dealsQuery = scopeToOrg(dealsQuery as any, orgId) as any
  const { data: dealsRaw, error: dealsErr } = await dealsQuery
  if (dealsErr) throw new HttpError(500, dealsErr.message)

  const allDeals = (dealsRaw ?? []).map((d: any) => ({ ...d, company_name: d.leads?.company_name ?? '', industry_id: d.leads?.industry_id ?? null }))
  let deals = industryId ? allDeals.filter((d) => d.industry_id === industryId) : allDeals
  if (assignedTo) deals = deals.filter((d) => d.owner_id === assignedTo)

  // Display currency: defaults to the organization's configured default, but can
  // be overridden for instant view-only conversion of every aggregate figure.
  let settingsQuery = supabase.from('app_settings').select('default_currency')
  settingsQuery = scopeToOrg(settingsQuery as any, orgId) as any
  const { data: orgSettings } = await settingsQuery.maybeSingle()
  const displayCurrency = params.displayCurrency || orgSettings?.default_currency || 'USD'

  const liveRates = await getOrRefreshRates()

  // Open deals haven't closed yet, so their value isn't finalized — always
  // convert using the latest live rate. Closed deals use the rate snapshot
  // locked in at close time (falling back to live rates for deals closed
  // before this feature existed, i.e. no snapshot stored).
  function convertedValue(d: any): number {
    const rates = d.closed_exchange_rate_snapshot?.rates ?? liveRates.rates
    return convertAmount(Number(d.value), d.currency, displayCurrency, rates)
  }

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]))
  const stageOf = (d: any) => stageById.get(d.stage_id)

  const openDeals = deals.filter((d) => !stageOf(d)?.is_closed)
  const closedWonDeals = deals.filter((d) => stageOf(d)?.is_won)
  const closedLostDeals = deals.filter((d) => stageOf(d)?.is_closed && !stageOf(d)?.is_won)

  const openPipelineValue = openDeals.reduce((sum, d) => sum + convertedValue(d), 0)
  const weightedPipelineValue = openDeals.reduce((sum, d) => sum + convertedValue(d) * (d.probability / 100), 0)

  const start = rangeStart(closedRange)
  const closedWonInRange = start
    ? closedWonDeals.filter((d) => d.actual_close_date && new Date(d.actual_close_date) >= start)
    : closedWonDeals
  const closedWonRevenue = closedWonInRange.reduce((sum, d) => sum + convertedValue(d), 0)

  const closedLostValue = closedLostDeals.reduce((sum, d) => sum + convertedValue(d), 0)

  const winRate = pct(closedWonDeals.length, closedWonDeals.length + closedLostDeals.length)
  const avgDealSize = closedWonDeals.length > 0 ? closedWonDeals.reduce((sum, d) => sum + convertedValue(d), 0) / closedWonDeals.length : 0

  // Compare calendar days, not full timestamps — created_at has a time-of-day component
  // while actual_close_date is a bare date, so a same-day close would otherwise read as
  // a slightly negative cycle length.
  const cycleDurations = closedWonDeals
    .filter((d) => d.actual_close_date)
    .map((d) => {
      const created = new Date(d.created_at)
      const createdDateOnly = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate())
      const closed = new Date(d.actual_close_date)
      const closedDateOnly = Date.UTC(closed.getUTCFullYear(), closed.getUTCMonth(), closed.getUTCDate())
      return Math.max(0, (closedDateOnly - createdDateOnly) / 86400000)
    })
  const avgSalesCycleDays =
    cycleDurations.length > 0 ? Math.round((cycleDurations.reduce((a, b) => a + b, 0) / cycleDurations.length) * 10) / 10 : 0

  const funnel = (stages ?? []).map((s) => {
    const stageDeals = deals.filter((d) => d.stage_id === s.id)
    return {
      stage: s.name,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + convertedValue(d), 0),
    }
  })

  const now = new Date()
  const trendMonths: string[] = []
  for (let i = 11; i >= 0; i--) {
    trendMonths.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))))
  }
  const revenueByMonth = new Map<string, number>(trendMonths.map((m) => [m, 0]))
  for (const d of closedWonDeals) {
    if (!d.actual_close_date) continue
    const key = monthKey(new Date(d.actual_close_date))
    if (revenueByMonth.has(key)) revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + convertedValue(d))
  }
  const trend = trendMonths.map((month) => ({ month, revenue: revenueByMonth.get(month) ?? 0 }))

  const lossReasonCounts = new Map<string, number>()
  for (const d of closedLostDeals) {
    const reason = d.outcome_reason || 'Unspecified'
    lossReasonCounts.set(reason, (lossReasonCounts.get(reason) ?? 0) + 1)
  }
  const lossReasonBreakdown = [...lossReasonCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const dealsClosingThisMonth = openDeals
    .filter((d) => d.expected_close_date && new Date(d.expected_close_date) >= monthStart && new Date(d.expected_close_date) < monthEnd)
    .sort((a, b) => new Date(a.expected_close_date).getTime() - new Date(b.expected_close_date).getTime())
    .slice(0, 50)
    .map((d) => ({
      id: d.id,
      name: d.name,
      company_name: d.company_name,
      value: d.value,
      currency: d.currency,
      expected_close_date: d.expected_close_date,
      is_overdue: new Date(d.expected_close_date) < now,
    }))

  const canViewValues = isAdminOrAbove(user) || user.permissions.canViewDealValues

  return json(200, {
    totals: {
      openPipelineValue: canViewValues ? openPipelineValue : null,
      weightedPipelineValue: canViewValues ? weightedPipelineValue : null,
      closedWonRevenue: canViewValues ? closedWonRevenue : null,
      closedLostValue: canViewValues ? closedLostValue : null,
      winRate,
      avgDealSize: canViewValues ? avgDealSize : null,
      avgSalesCycleDays,
      openDealsCount: openDeals.length,
      closedWonCount: closedWonDeals.length,
      closedLostCount: closedLostDeals.length,
    },
    values_masked: canViewValues ? undefined : true,
    closedRange,
    funnel: canViewValues ? funnel : funnel.map((f) => ({ ...f, value: null })),
    trend: canViewValues ? trend : trend.map((t) => ({ ...t, revenue: null })),
    lossReasonBreakdown,
    dealsClosingThisMonth: canViewValues ? dealsClosingThisMonth : dealsClosingThisMonth.map((d) => ({ ...d, value: null })),
    displayCurrency,
    ratesUpdatedAt: liveRates.fetchedAt,
  })
}
