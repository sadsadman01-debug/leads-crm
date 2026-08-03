import type { PaymentMethod } from './billing'

export type EarningsTierBucket = 'early_bird' | 'standard' | 'annual'
export type EarningsGranularity = 'day' | 'week' | 'month'

export interface EarningsSummary {
  gross_all_time: number
  net_all_time: number
  affiliate_commissions_all_time: number
  total_refunds_all_time: number
  this_month: { gross: number; net: number }
  this_week: { gross: number; net: number }
  today: { gross: number; net: number }
  active_paying_organizations: number
  avg_revenue_per_organization: number
  total_paying_organizations: number
  total_discounts_given: number
}

export interface EarningsTrendPoint {
  date: string
  gross: number
  net: number
  refunds: number
}

export interface EarningsTrendResponse {
  granularity: EarningsGranularity
  dateFrom: string
  dateTo: string
  points: EarningsTrendPoint[]
}

export interface PaymentMethodBreakdownRow {
  payment_method: PaymentMethod | 'unspecified'
  revenue: number
  count: number
}

export interface TierBreakdownRow {
  tier: EarningsTierBucket
  label: string
  revenue: number
  count: number
}

export interface PromoCodePerformanceRow {
  code: string
  times_used: number
  total_discount_given: number
  total_revenue_collected: number
}

export interface EarningsTransaction {
  type: 'payment' | 'refund' | 'referral_reward'
  id: string
  paid_at: string
  organization_id: string
  organization_name: string
  amount: number
  payment_method: PaymentMethod | null
  pricing_tier: 'early_bird' | 'standard' | null
  billing_cycle: 'monthly' | 'annual' | null
  promo_code_text: string | null
  discount_amount: number
  reason: string | null
  payment_reference_code: string | null
}

export interface EarningsTransactionFilters {
  dateFrom?: string
  dateTo?: string
  paymentMethod?: string
  pricingTier?: EarningsTierBucket
  search?: string
}
