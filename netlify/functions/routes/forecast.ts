import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { isAdminOrAbove, resolveOrganizationId, scopeToOrg } from '../lib/permissions.js'
import { getOrRefreshRates, convertAmount } from '../lib/exchangeRates.js'
import type { AuthedUser } from '../lib/auth.js'

interface Period {
  key: string
  type: 'month' | 'quarter'
  start: Date
  end: Date
  label: string
}

function quarterKey(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
}

function buildPeriods(): { thisMonth: Period; thisQuarter: Period; nextQuarter: Period } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const qStartMonth = Math.floor(m / 3) * 3

  const thisMonth: Period = {
    key: `${y}-${String(m + 1).padStart(2, '0')}`,
    type: 'month',
    start: new Date(Date.UTC(y, m, 1)),
    end: new Date(Date.UTC(y, m + 1, 1)),
    label: 'This Month',
  }
  const thisQuarterStart = new Date(Date.UTC(y, qStartMonth, 1))
  const thisQuarter: Period = {
    key: quarterKey(thisQuarterStart),
    type: 'quarter',
    start: thisQuarterStart,
    end: new Date(Date.UTC(y, qStartMonth + 3, 1)),
    label: 'This Quarter',
  }
  const nextQuarterStart = new Date(Date.UTC(y, qStartMonth + 3, 1))
  const nextQuarter: Period = {
    key: quarterKey(nextQuarterStart),
    type: 'quarter',
    start: nextQuarterStart,
    end: new Date(Date.UTC(y, qStartMonth + 6, 1)),
    label: 'Next Quarter',
  }
  return { thisMonth, thisQuarter, nextQuarter }
}

function paceStatus(forecast: number, quota: number, elapsedFraction: number): 'on_track' | 'at_risk' | 'behind' | 'no_quota' {
  if (!quota || quota <= 0) return 'no_quota'
  const expectedPace = quota * Math.max(elapsedFraction, 0.05)
  if (forecast >= expectedPace * 0.95) return 'on_track'
  if (forecast >= expectedPace * 0.7) return 'at_risk'
  return 'behind'
}

/** GET /forecast?displayCurrency=...&assignedTo=... — projected revenue for this
 * month/quarter/next quarter: (open deal value × win probability) for deals
 * expected to close in that period, plus already-Closed-Won revenue in it. */
export async function getForecast(event: HandlerEvent, user: AuthedUser) {
  const supabase = getSupabaseAdmin()
  const orgId = resolveOrganizationId(user, event)
  const params = event.queryStringParameters ?? {}
  const assignedTo = isAdminOrAbove(user) ? params.assignedTo || undefined : user.id

  let settingsQuery = supabase.from('app_settings').select('default_currency')
  settingsQuery = scopeToOrg(settingsQuery as any, orgId) as any
  const { data: orgSettings } = await settingsQuery.maybeSingle()
  const displayCurrency = params.displayCurrency || orgSettings?.default_currency || 'USD'

  let stagesQuery = supabase.from('deal_stages').select('id, is_closed, is_won')
  stagesQuery = scopeToOrg(stagesQuery as any, orgId) as any
  const { data: stages } = await stagesQuery
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]))

  let dealsQuery = supabase
    .from('deals')
    .select('value, currency, stage_id, probability, expected_close_date, actual_close_date, owner_id, closed_exchange_rate_snapshot')
    .limit(20000)
  dealsQuery = scopeToOrg(dealsQuery as any, orgId) as any
  const { data: dealsRaw, error } = await dealsQuery
  if (error) throw new HttpError(500, error.message)

  let deals = dealsRaw ?? []
  if (assignedTo) deals = deals.filter((d) => d.owner_id === assignedTo)

  const liveRates = await getOrRefreshRates()
  function convertedValue(d: any): number {
    const rates = d.closed_exchange_rate_snapshot?.rates ?? liveRates.rates
    return convertAmount(Number(d.value), d.currency, displayCurrency, rates)
  }

  const { thisMonth, thisQuarter, nextQuarter } = buildPeriods()
  const now = new Date()

  async function computeForPeriod(period: Period) {
    const openWeighted = deals
      .filter((d) => {
        const stage = stageById.get(d.stage_id)
        if (stage?.is_closed) return false
        if (!d.expected_close_date) return false
        const close = new Date(d.expected_close_date)
        return close >= period.start && close < period.end
      })
      .reduce((sum, d) => sum + convertedValue(d) * (d.probability / 100), 0)

    const closedWon = deals
      .filter((d) => {
        const stage = stageById.get(d.stage_id)
        if (!stage?.is_won) return false
        if (!d.actual_close_date) return false
        const closed = new Date(d.actual_close_date)
        return closed >= period.start && closed < period.end
      })
      .reduce((sum, d) => sum + convertedValue(d), 0)

    const elapsedFraction =
      now >= period.end ? 1 : now < period.start ? 0 : (now.getTime() - period.start.getTime()) / (period.end.getTime() - period.start.getTime())

    let quotaQuery = supabase.from('quotas').select('amount').eq('period_type', period.type).eq('period_key', period.key)
    quotaQuery = scopeToOrg(quotaQuery as any, orgId) as any
    quotaQuery = assignedTo ? quotaQuery.eq('user_id', assignedTo) : quotaQuery.is('user_id', null)
    const { data: quotaRow } = await quotaQuery.maybeSingle()
    const quota = Number(quotaRow?.amount ?? 0)

    const forecast = openWeighted + closedWon

    return {
      periodKey: period.key,
      label: period.label,
      forecast,
      openWeighted,
      closedWon,
      quota,
      progressPct: quota > 0 ? Math.round((forecast / quota) * 1000) / 10 : null,
      status: paceStatus(forecast, quota, elapsedFraction),
    }
  }

  const [monthResult, quarterResult, nextQuarterResult] = await Promise.all([
    computeForPeriod(thisMonth),
    computeForPeriod(thisQuarter),
    computeForPeriod(nextQuarter),
  ])

  return json(200, {
    displayCurrency,
    ratesUpdatedAt: liveRates.fetchedAt,
    thisMonth: monthResult,
    thisQuarter: quarterResult,
    nextQuarter: nextQuarterResult,
  })
}
