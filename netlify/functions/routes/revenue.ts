import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'

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
 * Sums are raw numeric totals across whatever currencies deals happen to use —
 * there's no FX conversion (no paid external API), so mixing currencies across
 * deals will produce a misleading total. Fine for the common single-currency
 * case; documented as a known limitation for multi-currency shops.
 */
export async function getRevenueSummary(event: HandlerEvent) {
  const supabase = getSupabaseAdmin()
  const params = event.queryStringParameters ?? {}
  const industryId = params.industryId || undefined
  const closedRange: ClosedRange = (['all', 'month', 'quarter', 'year'] as const).includes(
    params.closedRange as ClosedRange
  )
    ? (params.closedRange as ClosedRange)
    : 'all'

  const { data: stages, error: stagesErr } = await supabase
    .from('deal_stages')
    .select('id, name, position, is_closed, is_won')
    .order('position', { ascending: true })
  if (stagesErr) throw new HttpError(500, stagesErr.message)

  const { data: dealsRaw, error: dealsErr } = await supabase
    .from('deals')
    .select('id, name, value, currency, stage_id, probability, expected_close_date, actual_close_date, outcome_reason, created_at, lead_id, leads ( company_name, industry_id )')
    .order('created_at', { ascending: true })
    .limit(MAX_DEALS_FOR_AGGREGATION)
  if (dealsErr) throw new HttpError(500, dealsErr.message)

  const allDeals = (dealsRaw ?? []).map((d: any) => ({ ...d, company_name: d.leads?.company_name ?? '', industry_id: d.leads?.industry_id ?? null }))
  const deals = industryId ? allDeals.filter((d) => d.industry_id === industryId) : allDeals

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]))
  const stageOf = (d: any) => stageById.get(d.stage_id)

  const openDeals = deals.filter((d) => !stageOf(d)?.is_closed)
  const closedWonDeals = deals.filter((d) => stageOf(d)?.is_won)
  const closedLostDeals = deals.filter((d) => stageOf(d)?.is_closed && !stageOf(d)?.is_won)

  const openPipelineValue = openDeals.reduce((sum, d) => sum + Number(d.value), 0)
  const weightedPipelineValue = openDeals.reduce((sum, d) => sum + Number(d.value) * (d.probability / 100), 0)

  const start = rangeStart(closedRange)
  const closedWonInRange = start
    ? closedWonDeals.filter((d) => d.actual_close_date && new Date(d.actual_close_date) >= start)
    : closedWonDeals
  const closedWonRevenue = closedWonInRange.reduce((sum, d) => sum + Number(d.value), 0)

  const closedLostValue = closedLostDeals.reduce((sum, d) => sum + Number(d.value), 0)

  const winRate = pct(closedWonDeals.length, closedWonDeals.length + closedLostDeals.length)
  const avgDealSize = closedWonDeals.length > 0 ? closedWonRevenueAllTime(closedWonDeals) / closedWonDeals.length : 0

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
      value: stageDeals.reduce((sum, d) => sum + Number(d.value), 0),
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
    if (revenueByMonth.has(key)) revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(d.value))
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

  return json(200, {
    totals: {
      openPipelineValue,
      weightedPipelineValue,
      closedWonRevenue,
      closedLostValue,
      winRate,
      avgDealSize,
      avgSalesCycleDays,
      openDealsCount: openDeals.length,
      closedWonCount: closedWonDeals.length,
      closedLostCount: closedLostDeals.length,
    },
    closedRange,
    funnel,
    trend,
    lossReasonBreakdown,
    dealsClosingThisMonth,
  })
}

function closedWonRevenueAllTime(closedWonDeals: any[]): number {
  return closedWonDeals.reduce((sum, d) => sum + Number(d.value), 0)
}
