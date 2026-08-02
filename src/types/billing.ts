export type PricingTier = 'early_bird' | 'standard'
export type PaymentStatus = 'pending' | 'received' | 'waived'
export type BillingStatus = 'pending' | 'overdue' | 'due_soon' | 'paid'
export type BillingCycle = 'monthly' | 'annual'

export interface PublicPricing {
  pricing_tier: PricingTier
  monthly_price_usd: number
  annual_total_usd: number
  /** The current Standard rate, regardless of which tier actually applies —
   * lets the Request Access form show "was $X, now $Y" savings while Early
   * Bird is active. */
  standard_price_usd: number
  standard_annual_total_usd: number
  spots_remaining: number
  payment_instructions: string | null
  promotional_benefits: string[]
}

export interface BillingSettings {
  id: string
  payment_instructions: string | null
  early_bird_threshold: number
  early_bird_price_usd: number
  standard_price_usd: number
  promotional_banner_text: string | null
  grace_period_days: number
}

export interface OrganizationBillingRow {
  id: string
  name: string
  status: 'active' | 'suspended'
  pricing_tier: PricingTier | null
  monthly_price_usd: number | null
  billing_cycle: BillingCycle | null
  annual_total_usd: number | null
  payment_status: PaymentStatus | null
  subscription_end_date: string | null
  billing_status: BillingStatus
}

export interface MyOrgBilling {
  pricing_tier: PricingTier | null
  monthly_price_usd: number | null
  billing_cycle: BillingCycle | null
  annual_total_usd: number | null
  subscription_end_date: string | null
  payment_instructions: string | null
}

/** The 402 error payload requireUser returns once an Organization's
 * subscription has actually expired — the shape the Subscription Expired
 * screen renders from (read off the caught ApiError's `.details`). */
export interface SubscriptionExpiredDetails {
  error: 'subscription_expired'
  subscription_end_date: string
  billing_cycle: BillingCycle
  monthly_price_usd: number | null
  annual_total_usd: number | null
  payment_instructions: string | null
}

export const PRICING_TIER_LABELS: Record<PricingTier, string> = {
  early_bird: 'Early Bird',
  standard: 'Standard',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  received: 'Received',
  waived: 'Waived',
}

export function amountForCycle(cycle: BillingCycle | null, monthlyPriceUsd: number | null, annualTotalUsd: number | null): string {
  if (cycle === 'annual' && annualTotalUsd != null) return `৳${Math.round(annualTotalUsd)}/year`
  if (monthlyPriceUsd != null) return `৳${monthlyPriceUsd}/month`
  return '—'
}
