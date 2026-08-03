import type { HandlerEvent } from '@netlify/functions'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { requireSuperAdmin } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

/** This is the Super Admin's OWN business earnings from selling Leadify
 * subscriptions — aggregated exclusively from billing_history (+
 * affiliate_commissions as a cost) and organizations' own billing/promo
 * fields. It must NEVER surface any Organization's own CRM data (their
 * leads/deals/pipeline) — nothing here touches those tables. */

const MAX_ROWS = 20000
const CHUNK_SIZE = 1000
const PAGE_SIZE_DEFAULT = 50

type PricingTier = 'early_bird' | 'standard'
type BillingCycle = 'monthly' | 'annual'
type TierBucket = 'early_bird' | 'standard' | 'annual'
type Granularity = 'day' | 'week' | 'month'

interface BillingRow {
  id: string
  organization_id: string
  amount_usd: number
  paid_at: string
  payment_method: string | null
  is_referral_reward: boolean
  notes: string | null
}

interface OrgLite {
  id: string
  name: string
  status: string
  pricing_tier: PricingTier | null
  billing_cycle: BillingCycle | null
  subscription_end_date: string | null
  promo_code_text: string | null
  discount_amount_bdt: number
  first_payment_confirmed_at: string | null
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function startOfWeekStr(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const diffToMonday = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - diffToMonday)
  return utc.toISOString().slice(0, 10)
}

function startOfMonthStr(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function tierBucketOf(org: Pick<OrgLite, 'pricing_tier' | 'billing_cycle'> | undefined): TierBucket | null {
  if (!org) return null
  if (org.billing_cycle === 'annual') return 'annual'
  if (org.pricing_tier === 'early_bird' || org.pricing_tier === 'standard') return org.pricing_tier
  return null
}

/** Fetches every billing_history row (up to MAX_ROWS, chunked) — this is the
 * one place every other endpoint below builds on top of. Includes
 * is_referral_reward rows (amount always 0, a free-month grant from the
 * Business Referral Program, never real revenue) — callers computing
 * revenue figures must filter those out via realOnly(), while the
 * Detailed Transaction Log keeps them (clearly labeled) for a complete record. */
async function fetchAllBillingHistory(dateFrom?: string, dateTo?: string): Promise<BillingRow[]> {
  const supabase = getSupabaseAdmin()
  const rows: BillingRow[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += CHUNK_SIZE) {
    let query = supabase.from('billing_history').select('id, organization_id, amount_usd, paid_at, payment_method, is_referral_reward, notes')
    if (dateFrom) query = query.gte('paid_at', dateFrom)
    if (dateTo) query = query.lte('paid_at', dateTo)
    const { data, error } = await query.order('paid_at', { ascending: true }).range(offset, offset + CHUNK_SIZE - 1)
    if (error) throw new HttpError(500, error.message)
    rows.push(...((data ?? []) as BillingRow[]))
    if (!data || data.length < CHUNK_SIZE) break
  }
  return rows
}

function realOnly(rows: BillingRow[]): BillingRow[] {
  return rows.filter((r) => !r.is_referral_reward)
}

async function fetchAllCommissions(dateFrom?: string, dateTo?: string): Promise<Array<{ commission_amount_usd: number; created_at: string }>> {
  const supabase = getSupabaseAdmin()
  const rows: Array<{ commission_amount_usd: number; created_at: string }> = []
  for (let offset = 0; offset < MAX_ROWS; offset += CHUNK_SIZE) {
    let query = supabase.from('affiliate_commissions').select('commission_amount_usd, created_at')
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`)
    const { data, error } = await query.order('created_at', { ascending: true }).range(offset, offset + CHUNK_SIZE - 1)
    if (error) throw new HttpError(500, error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < CHUNK_SIZE) break
  }
  return rows
}

interface RefundRow {
  id: string
  organization_id: string
  billing_history_id: string | null
  amount_bdt: number
  refund_date: string
  reason: string | null
}

/** A second cost deduction alongside affiliate_commissions when computing
 * Net Revenue — money the Super Admin has actually sent back, manually,
 * outside the app. */
async function fetchAllRefunds(dateFrom?: string, dateTo?: string): Promise<RefundRow[]> {
  const supabase = getSupabaseAdmin()
  const rows: RefundRow[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += CHUNK_SIZE) {
    let query = supabase.from('refunds').select('id, organization_id, billing_history_id, amount_bdt, refund_date, reason')
    if (dateFrom) query = query.gte('refund_date', dateFrom)
    if (dateTo) query = query.lte('refund_date', dateTo)
    const { data, error } = await query.order('refund_date', { ascending: true }).range(offset, offset + CHUNK_SIZE - 1)
    if (error) throw new HttpError(500, error.message)
    rows.push(...((data ?? []) as RefundRow[]))
    if (!data || data.length < CHUNK_SIZE) break
  }
  return rows
}

async function fetchOrgsByIds(ids: string[]): Promise<Map<string, OrgLite>> {
  if (ids.length === 0) return new Map()
  const supabase = getSupabaseAdmin()
  const uniqueIds = [...new Set(ids)]
  const orgs: OrgLite[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, status, pricing_tier, billing_cycle, subscription_end_date, promo_code_text, discount_amount_bdt, first_payment_confirmed_at')
      .in('id', uniqueIds.slice(i, i + CHUNK_SIZE))
    if (error) throw new HttpError(500, error.message)
    orgs.push(...((data ?? []) as OrgLite[]))
  }
  return new Map(orgs.map((o) => [o.id, o]))
}

/** GET /earnings/summary — the headline stat cards. */
export async function getEarningsSummary(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const [billingRaw, commissions, refunds] = await Promise.all([fetchAllBillingHistory(), fetchAllCommissions(), fetchAllRefunds()])
  const billing = realOnly(billingRaw)

  const grossAllTime = billing.reduce((sum, r) => sum + Number(r.amount_usd), 0)
  const commissionsAllTime = commissions.reduce((sum, c) => sum + Number(c.commission_amount_usd), 0)
  const refundsAllTime = refunds.reduce((sum, r) => sum + Number(r.amount_bdt), 0)
  const netAllTime = grossAllTime - commissionsAllTime - refundsAllTime

  const now = new Date()
  const monthStart = startOfMonthStr(now)
  const weekStart = startOfWeekStr(now)
  const today = todayStr()

  function grossSince(start: string): number {
    return billing.filter((r) => r.paid_at >= start).reduce((sum, r) => sum + Number(r.amount_usd), 0)
  }
  function commissionsSince(startIso: string): number {
    return commissions.filter((c) => c.created_at >= startIso).reduce((sum, c) => sum + Number(c.commission_amount_usd), 0)
  }
  function refundsSince(start: string): number {
    return refunds.filter((r) => r.refund_date >= start).reduce((sum, r) => sum + Number(r.amount_bdt), 0)
  }

  const monthGross = grossSince(monthStart)
  const weekGross = grossSince(weekStart)
  const todayGross = grossSince(today)
  const monthNet = monthGross - commissionsSince(`${monthStart}T00:00:00.000Z`) - refundsSince(monthStart)
  const weekNet = weekGross - commissionsSince(`${weekStart}T00:00:00.000Z`) - refundsSince(weekStart)
  const todayNet = todayGross - commissionsSince(`${today}T00:00:00.000Z`) - refundsSince(today)

  const payingOrgIds = [...new Set(billing.map((r) => r.organization_id))]

  const { count: activeOrgCount, error: activeErr } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .not('subscription_end_date', 'is', null)
    .gte('subscription_end_date', today)
  if (activeErr) throw new HttpError(500, activeErr.message)

  const avgRevenuePerOrg = payingOrgIds.length > 0 ? grossAllTime / payingOrgIds.length : 0

  const { data: discountOrgs, error: discountErr } = await supabase.from('organizations').select('discount_amount_bdt').gt('discount_amount_bdt', 0)
  if (discountErr) throw new HttpError(500, discountErr.message)
  const totalDiscountsGiven = (discountOrgs ?? []).reduce((sum, o: any) => sum + Number(o.discount_amount_bdt), 0)

  return json(200, {
    gross_all_time: grossAllTime,
    net_all_time: netAllTime,
    affiliate_commissions_all_time: commissionsAllTime,
    total_refunds_all_time: refundsAllTime,
    this_month: { gross: monthGross, net: monthNet },
    this_week: { gross: weekGross, net: weekNet },
    today: { gross: todayGross, net: todayNet },
    active_paying_organizations: activeOrgCount ?? 0,
    avg_revenue_per_organization: avgRevenuePerOrg,
    total_paying_organizations: payingOrgIds.length,
    total_discounts_given: totalDiscountsGiven,
  })
}

/** GET /earnings/trend?granularity=day|week|month&dateFrom=&dateTo= — Gross vs
 * Net revenue over time. Defaults (no dateFrom/dateTo given): last 30 days /
 * last 12 weeks / last 12 months, matching the CRM Dashboard's own trend
 * chart convention; explicit dateFrom/dateTo implements "Custom Range". */
export async function getEarningsTrend(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const params = event.queryStringParameters ?? {}
  const granularity: Granularity = (['day', 'week', 'month'] as const).includes(params.granularity as Granularity)
    ? (params.granularity as Granularity)
    : 'day'

  const now = new Date()
  let dateFrom = params.dateFrom || ''
  let dateTo = params.dateTo || todayStr()
  if (!dateFrom) {
    if (granularity === 'month') dateFrom = startOfMonthStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)))
    else if (granularity === 'week') dateFrom = startOfWeekStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 11 * 7)))
    else dateFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString().slice(0, 10)
  }

  const bucketKeyOf = (dateStr: string): string => {
    const d = new Date(`${dateStr}T00:00:00.000Z`)
    if (granularity === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    if (granularity === 'week') return startOfWeekStr(d)
    return dateStr
  }

  function buildBucketKeys(): string[] {
    const keys: string[] = []
    const from = new Date(`${dateFrom}T00:00:00.000Z`)
    const to = new Date(`${dateTo}T00:00:00.000Z`)
    if (granularity === 'month') {
      const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
      while (cursor <= to) {
        keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`)
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      }
    } else if (granularity === 'week') {
      const cursor = new Date(`${startOfWeekStr(from)}T00:00:00.000Z`)
      while (cursor <= to) {
        keys.push(cursor.toISOString().slice(0, 10))
        cursor.setUTCDate(cursor.getUTCDate() + 7)
      }
    } else {
      const cursor = new Date(from)
      while (cursor <= to) {
        keys.push(cursor.toISOString().slice(0, 10))
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }
    return [...new Set(keys)]
  }

  const [billingRaw, commissions, refunds] = await Promise.all([
    fetchAllBillingHistory(dateFrom, dateTo),
    fetchAllCommissions(dateFrom, `${dateTo}`),
    fetchAllRefunds(dateFrom, dateTo),
  ])
  const billing = realOnly(billingRaw)

  const bucketKeys = buildBucketKeys()
  const grossByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]))
  const commissionsByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]))
  const refundsByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]))

  for (const row of billing) {
    const key = bucketKeyOf(row.paid_at)
    if (grossByBucket.has(key)) grossByBucket.set(key, (grossByBucket.get(key) ?? 0) + Number(row.amount_usd))
  }
  for (const c of commissions) {
    const key = bucketKeyOf(c.created_at.slice(0, 10))
    if (commissionsByBucket.has(key)) commissionsByBucket.set(key, (commissionsByBucket.get(key) ?? 0) + Number(c.commission_amount_usd))
  }
  for (const r of refunds) {
    const key = bucketKeyOf(r.refund_date)
    if (refundsByBucket.has(key)) refundsByBucket.set(key, (refundsByBucket.get(key) ?? 0) + Number(r.amount_bdt))
  }

  const points = bucketKeys.map((key) => {
    const gross = grossByBucket.get(key) ?? 0
    const refundAmount = refundsByBucket.get(key) ?? 0
    const net = gross - (commissionsByBucket.get(key) ?? 0) - refundAmount
    return { date: key, gross, net, refunds: refundAmount }
  })

  return json(200, { granularity, dateFrom, dateTo, points })
}

/** GET /earnings/by-payment-method?dateFrom=&dateTo= */
export async function getEarningsByPaymentMethod(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const params = event.queryStringParameters ?? {}
  const billing = realOnly(await fetchAllBillingHistory(params.dateFrom || undefined, params.dateTo || undefined))

  const byMethod = new Map<string, { revenue: number; count: number }>()
  for (const row of billing) {
    const method = row.payment_method || 'unspecified'
    const entry = byMethod.get(method) ?? { revenue: 0, count: 0 }
    entry.revenue += Number(row.amount_usd)
    entry.count += 1
    byMethod.set(method, entry)
  }

  const breakdown = [...byMethod.entries()]
    .map(([payment_method, v]) => ({ payment_method, revenue: v.revenue, count: v.count }))
    .sort((a, b) => b.revenue - a.revenue)

  return json(200, { breakdown })
}

/** GET /earnings/by-tier?dateFrom=&dateTo= — Early Bird vs Standard vs Annual,
 * bucketed per TRANSACTION (a monthly-cycle org's every payment counts toward
 * its tier; an annual-cycle org's payments always count as "Annual" instead,
 * since those are much larger one-time amounts regardless of original tier). */
export async function getEarningsByTier(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const params = event.queryStringParameters ?? {}
  const billing = realOnly(await fetchAllBillingHistory(params.dateFrom || undefined, params.dateTo || undefined))
  const orgById = await fetchOrgsByIds(billing.map((r) => r.organization_id))

  const buckets: Record<TierBucket, { revenue: number; count: number }> = {
    early_bird: { revenue: 0, count: 0 },
    standard: { revenue: 0, count: 0 },
    annual: { revenue: 0, count: 0 },
  }

  for (const row of billing) {
    const bucket = tierBucketOf(orgById.get(row.organization_id))
    if (!bucket) continue
    buckets[bucket].revenue += Number(row.amount_usd)
    buckets[bucket].count += 1
  }

  return json(200, {
    breakdown: [
      { tier: 'early_bird', label: 'Early Bird', ...buckets.early_bird },
      { tier: 'standard', label: 'Standard', ...buckets.standard },
      { tier: 'annual', label: 'Annual Billing', ...buckets.annual },
    ],
  })
}

/** GET /earnings/promo-performance — all-time, grouped by the promo code text
 * actually applied (survives the promo code itself later being edited or
 * deleted — same "snapshot" convention used everywhere else this field
 * appears). total_revenue_collected is that group's FULL lifetime billing
 * history (not just the discounted first payment), so a campaign's true
 * long-run value is visible, not just the up-front discount cost. */
export async function getPromoCodePerformance(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const supabase = getSupabaseAdmin()

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, promo_code_text, discount_amount_bdt')
    .not('promo_code_text', 'is', null)
  if (error) throw new HttpError(500, error.message)
  if (!orgs || orgs.length === 0) return json(200, { promo_codes: [] })

  const orgIds = orgs.map((o: any) => o.id)
  const billing = realOnly(await fetchAllBillingHistory())
  const revenueByOrg = new Map<string, number>()
  for (const row of billing) {
    if (!orgIds.includes(row.organization_id)) continue
    revenueByOrg.set(row.organization_id, (revenueByOrg.get(row.organization_id) ?? 0) + Number(row.amount_usd))
  }

  const byCode = new Map<string, { times_used: number; total_discount_given: number; total_revenue_collected: number }>()
  for (const org of orgs as any[]) {
    const code = org.promo_code_text as string
    const entry = byCode.get(code) ?? { times_used: 0, total_discount_given: 0, total_revenue_collected: 0 }
    entry.times_used += 1
    entry.total_discount_given += Number(org.discount_amount_bdt)
    entry.total_revenue_collected += revenueByOrg.get(org.id) ?? 0
    byCode.set(code, entry)
  }

  const promo_codes = [...byCode.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.total_revenue_collected - a.total_revenue_collected)

  return json(200, { promo_codes })
}

interface TransactionFilters {
  dateFrom?: string
  dateTo?: string
  paymentMethod?: string
  pricingTier?: TierBucket
  search?: string
}

function parseTransactionFilters(params: Record<string, string | undefined> | null): TransactionFilters {
  const p = params ?? {}
  return {
    dateFrom: p.dateFrom || undefined,
    dateTo: p.dateTo || undefined,
    paymentMethod: p.paymentMethod || undefined,
    pricingTier: (['early_bird', 'standard', 'annual'] as const).includes(p.pricingTier as TierBucket) ? (p.pricingTier as TierBucket) : undefined,
    search: (p.search ?? '').trim() || undefined,
  }
}

/** Shared by the paginated list and the CSV export — resolves filters into
 * the joined transaction rows the Detailed Transaction Log renders. Org-name
 * search and pricing-tier filters are resolved against `organizations` first
 * (cheap, that table stays small) so the billing_history query itself can
 * still filter by an indexed `.in('organization_id', …)` rather than pulling
 * every row and filtering in memory. */
async function resolveFilteredTransactions(filters: TransactionFilters) {
  const supabase = getSupabaseAdmin()

  let orgIdFilter: string[] | null = null
  if (filters.search || filters.pricingTier) {
    let orgQuery = supabase.from('organizations').select('id, pricing_tier, billing_cycle')
    if (filters.search) orgQuery = orgQuery.ilike('name', `%${filters.search}%`)
    const { data: matchingOrgs, error: orgErr } = await orgQuery
    if (orgErr) throw new HttpError(500, orgErr.message)
    let ids = (matchingOrgs ?? []).map((o: any) => o.id as string)
    if (filters.pricingTier) {
      const idsMatchingTier = new Set(
        (matchingOrgs ?? []).filter((o: any) => tierBucketOf(o) === filters.pricingTier).map((o: any) => o.id as string)
      )
      ids = ids.filter((id) => idsMatchingTier.has(id))
    }
    orgIdFilter = ids
  }

  let billing = await fetchAllBillingHistory(filters.dateFrom, filters.dateTo)
  if (filters.paymentMethod) billing = billing.filter((r) => (r.payment_method || 'unspecified') === filters.paymentMethod)
  if (orgIdFilter) {
    const idSet = new Set(orgIdFilter)
    billing = billing.filter((r) => idSet.has(r.organization_id))
  }

  // Refunds have no payment_method of their own, so a payment-method filter
  // simply excludes them from the log rather than trying to match one.
  let refunds = filters.paymentMethod ? [] : await fetchAllRefunds(filters.dateFrom, filters.dateTo)
  if (orgIdFilter) {
    const idSet = new Set(orgIdFilter)
    refunds = refunds.filter((r) => idSet.has(r.organization_id))
  }

  const orgById = await fetchOrgsByIds([...billing.map((r) => r.organization_id), ...refunds.map((r) => r.organization_id)])

  const paymentRows = billing.map((row) => {
    const org = orgById.get(row.organization_id)
    const isFirstPayment = Boolean(org?.first_payment_confirmed_at) && org!.first_payment_confirmed_at!.slice(0, 10) === row.paid_at
    return {
      type: (row.is_referral_reward ? 'referral_reward' : 'payment') as 'payment' | 'referral_reward',
      id: row.id,
      paid_at: row.paid_at,
      organization_id: row.organization_id,
      organization_name: org?.name ?? 'Unknown Organization',
      amount: Number(row.amount_usd),
      payment_method: row.payment_method,
      pricing_tier: org?.pricing_tier ?? null,
      billing_cycle: org?.billing_cycle ?? null,
      promo_code_text: isFirstPayment ? org?.promo_code_text ?? null : null,
      discount_amount: isFirstPayment ? Number(org?.discount_amount_bdt ?? 0) : 0,
      reason: row.is_referral_reward ? row.notes : null,
    }
  })

  const refundRows = refunds.map((row) => {
    const org = orgById.get(row.organization_id)
    return {
      type: 'refund' as const,
      id: row.id,
      paid_at: row.refund_date,
      organization_id: row.organization_id,
      organization_name: org?.name ?? 'Unknown Organization',
      amount: -Number(row.amount_bdt),
      payment_method: null,
      pricing_tier: org?.pricing_tier ?? null,
      billing_cycle: org?.billing_cycle ?? null,
      promo_code_text: null,
      discount_amount: 0,
      reason: row.reason,
    }
  })

  return [...paymentRows, ...refundRows].sort((a, b) => (a.paid_at < b.paid_at ? 1 : a.paid_at > b.paid_at ? -1 : 0))
}

/** GET /earnings/transactions?dateFrom=&dateTo=&paymentMethod=&pricingTier=&search=&page=&pageSize= */
export async function listEarningsTransactions(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const filters = parseTransactionFilters(event.queryStringParameters)
  const rows = await resolveFilteredTransactions(filters)

  const page = Math.max(1, Number(event.queryStringParameters?.page) || 1)
  const pageSize = Math.max(1, Math.min(200, Number(event.queryStringParameters?.pageSize) || PAGE_SIZE_DEFAULT))
  const from = (page - 1) * pageSize
  const paged = rows.slice(from, from + pageSize)

  return json(200, { transactions: paged, total: rows.length })
}

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return ''
  return Papa.unparse(rows)
}

/** GET /earnings/transactions/export — same filters as listEarningsTransactions,
 * but every matching row (up to MAX_ROWS) rather than one page. */
export async function exportEarningsTransactionsCsv(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const filters = parseTransactionFilters(event.queryStringParameters)
  const rows = await resolveFilteredTransactions(filters)

  const csvRows = rows.map((r) => ({
    type: r.type,
    date: r.paid_at,
    organization: r.organization_name,
    amount_bdt: r.amount,
    payment_method: r.payment_method ?? '',
    promo_code: r.promo_code_text ?? '',
    discount_amount_bdt: r.discount_amount,
    pricing_tier: r.pricing_tier ?? '',
    billing_cycle: r.billing_cycle ?? '',
    reason: r.reason ?? '',
  }))

  const dateStr = todayStr()
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="Earnings_Transactions_${dateStr}.csv"`,
    },
    body: toCsv(csvRows),
  }
}
