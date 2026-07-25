import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { resolveOrganizationId, scopeToOrg } from '../lib/permissions.js'
import { getOrRefreshRates, convertAmount } from '../lib/exchangeRates.js'
import type { AuthedUser } from '../lib/auth.js'

type Granularity = 'month' | 'quarter' | 'year'

interface Range {
  start: Date
  end: Date
}

function monthRange(y: number, m: number): Range {
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) }
}
function quarterRange(y: number, qStartMonth: number): Range {
  return { start: new Date(Date.UTC(y, qStartMonth, 1)), end: new Date(Date.UTC(y, qStartMonth + 3, 1)) }
}
function yearRange(y: number): Range {
  return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)) }
}

function currentAndPrevious(granularity: Granularity): { current: Range; previous: Range } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()

  if (granularity === 'month') {
    return { current: monthRange(y, m), previous: monthRange(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1) }
  }
  if (granularity === 'quarter') {
    const qStart = Math.floor(m / 3) * 3
    return { current: quarterRange(y, qStart), previous: qStart === 0 ? quarterRange(y - 1, 9) : quarterRange(y, qStart - 3) }
  }
  return { current: yearRange(y), previous: yearRange(y - 1) }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null // null = "new" (no prior baseline to compare against)
  return Math.round(((current - previous) / previous) * 1000) / 10
}

async function computeMetricsForRange(orgId: string | null, range: Range, displayCurrency: string, liveRates: any) {
  const supabase = getSupabaseAdmin()

  let leadsQuery = supabase
    .from('leads')
    .select('id, created_at, lead_status(converted)')
    .gte('created_at', range.start.toISOString())
    .lt('created_at', range.end.toISOString())
  leadsQuery = scopeToOrg(leadsQuery as any, orgId) as any
  const { data: leads, error: leadsErr } = await leadsQuery
  if (leadsErr) throw new HttpError(500, leadsErr.message)

  const leadsAdded = leads?.length ?? 0
  const convertedCount = (leads ?? []).filter((l: any) => (Array.isArray(l.lead_status) ? l.lead_status[0] : l.lead_status)?.converted).length
  const conversionRate = leadsAdded > 0 ? Math.round((convertedCount / leadsAdded) * 1000) / 10 : 0

  let dealsQuery = supabase
    .from('deals')
    .select('value, currency, stage_id, actual_close_date, closed_exchange_rate_snapshot, deal_stages(is_won)')
    .gte('actual_close_date', range.start.toISOString().slice(0, 10))
    .lt('actual_close_date', range.end.toISOString().slice(0, 10))
  dealsQuery = scopeToOrg(dealsQuery as any, orgId) as any
  const { data: deals, error: dealsErr } = await dealsQuery
  if (dealsErr) throw new HttpError(500, dealsErr.message)

  const wonDeals = (deals ?? []).filter((d: any) => d.deal_stages?.is_won)
  const revenue = wonDeals.reduce((sum: number, d: any) => {
    const rates = d.closed_exchange_rate_snapshot?.rates ?? liveRates.rates
    return sum + convertAmount(Number(d.value), d.currency, displayCurrency, rates)
  }, 0)
  const avgDealSize = wonDeals.length > 0 ? revenue / wonDeals.length : 0

  return { leadsAdded, conversionRate, revenue, avgDealSize, winRate: null as number | null }
}

/** GET /trends?granularity=month|quarter&displayCurrency=... — current vs prior
 * equivalent period for the headline metrics, with percentage change. */
export async function getTrends(event: HandlerEvent, user: AuthedUser) {
  const orgId = resolveOrganizationId(user, event)
  const params = event.queryStringParameters ?? {}
  const granularity = (['month', 'quarter'] as const).includes(params.granularity as any) ? (params.granularity as Granularity) : 'month'
  const displayCurrency = params.displayCurrency || 'USD'

  const liveRates = await getOrRefreshRates()
  const { current, previous } = currentAndPrevious(granularity)

  const [currentMetrics, previousMetrics] = await Promise.all([
    computeMetricsForRange(orgId, current, displayCurrency, liveRates),
    computeMetricsForRange(orgId, previous, displayCurrency, liveRates),
  ])

  const metrics = (['leadsAdded', 'conversionRate', 'revenue', 'avgDealSize'] as const).map((key) => ({
    key,
    current: currentMetrics[key],
    previous: previousMetrics[key],
    pctChange: pctChange(currentMetrics[key] as number, previousMetrics[key] as number),
  }))

  return json(200, { granularity, displayCurrency, metrics })
}

/** GET /trends/period-comparisons?displayCurrency=... — Dashboard quick-comparison
 * widgets: this month/quarter/year vs the prior equivalent period, in one call. */
export async function getPeriodComparisons(event: HandlerEvent, user: AuthedUser) {
  const orgId = resolveOrganizationId(user, event)
  const params = event.queryStringParameters ?? {}
  const displayCurrency = params.displayCurrency || 'USD'
  const liveRates = await getOrRefreshRates()

  async function forGranularity(granularity: Granularity) {
    const { current, previous } = currentAndPrevious(granularity)
    const [currentMetrics, previousMetrics] = await Promise.all([
      computeMetricsForRange(orgId, current, displayCurrency, liveRates),
      computeMetricsForRange(orgId, previous, displayCurrency, liveRates),
    ])
    return {
      leadsAdded: { current: currentMetrics.leadsAdded, previous: previousMetrics.leadsAdded, pctChange: pctChange(currentMetrics.leadsAdded, previousMetrics.leadsAdded) },
      conversionRate: { current: currentMetrics.conversionRate, previous: previousMetrics.conversionRate, pctChange: pctChange(currentMetrics.conversionRate, previousMetrics.conversionRate) },
      revenue: { current: currentMetrics.revenue, previous: previousMetrics.revenue, pctChange: pctChange(currentMetrics.revenue, previousMetrics.revenue) },
    }
  }

  const [month, quarter, year] = await Promise.all([forGranularity('month'), forGranularity('quarter'), forGranularity('year')])
  return json(200, { displayCurrency, ratesUpdatedAt: liveRates.fetchedAt, month, quarter, year })
}
