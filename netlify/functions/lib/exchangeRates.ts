import { getSupabaseAdmin } from './supabaseAdmin.js'
import { HttpError } from './http.js'

const STALE_AFTER_MS = 20 * 60 * 60 * 1000 // ~20 hours — source updates once/24h; stay well under their 1/hr policy
const RATES_URL = 'https://open.er-api.com/v6/latest/USD'

export interface RatesSnapshot {
  base: string
  rates: Record<string, number>
  fetchedAt: string
}

/** Returns the cached USD-based rates, refreshing from the free ExchangeRate-API
 * open endpoint first if the cache is missing or older than ~20 hours. Server-side
 * only — the external call never happens from the browser. */
export async function getOrRefreshRates(): Promise<RatesSnapshot> {
  const supabase = getSupabaseAdmin()
  const { data: cached, error } = await supabase
    .from('exchange_rates')
    .select('base_currency, rates, fetched_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)

  const isStale = !cached || Date.now() - new Date(cached.fetched_at).getTime() > STALE_AFTER_MS
  if (!isStale) {
    return { base: cached.base_currency, rates: cached.rates as Record<string, number>, fetchedAt: cached.fetched_at }
  }

  try {
    const res = await fetch(RATES_URL)
    if (!res.ok) throw new Error(`ExchangeRate-API responded with ${res.status}`)
    const body = await res.json()
    if (body.result !== 'success' || !body.rates) throw new Error('Unexpected ExchangeRate-API response shape')

    const fetchedAt = new Date().toISOString()
    const { error: upsertErr } = await supabase
      .from('exchange_rates')
      .upsert({ id: 1, base_currency: 'USD', rates: body.rates, fetched_at: fetchedAt })
    if (upsertErr) throw new HttpError(500, upsertErr.message)

    return { base: 'USD', rates: body.rates, fetchedAt }
  } catch (err) {
    // If the external call fails but we have a (stale) cache, prefer stale data
    // over breaking the Revenue dashboard entirely.
    if (cached) return { base: cached.base_currency, rates: cached.rates as Record<string, number>, fetchedAt: cached.fetched_at }
    throw err instanceof HttpError ? err : new HttpError(502, 'Could not fetch exchange rates and no cache is available')
  }
}

/** Converts an amount between two currencies using USD-based rates (rates[X] = units of X per 1 USD). */
export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount
  const fromRate = rates[from]
  const toRate = rates[to]
  if (!fromRate || !toRate) return amount // unknown currency code — pass through rather than corrupt the total
  return (amount / fromRate) * toRate
}
