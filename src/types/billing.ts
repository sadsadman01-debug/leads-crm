export type PricingTier = 'early_bird' | 'standard'
export type PaymentStatus = 'pending' | 'received' | 'waived'
export type BillingStatus = 'pending' | 'overdue' | 'due_soon' | 'paid'

export interface PublicPricing {
  pricing_tier: PricingTier
  monthly_price_usd: number
  spots_remaining: number
  payment_instructions: string | null
}

export interface BillingSettings {
  id: string
  payment_instructions: string | null
  early_bird_threshold: number
  early_bird_price_usd: number
  standard_price_usd: number
}

export interface OrganizationBillingRow {
  id: string
  name: string
  status: 'active' | 'suspended'
  pricing_tier: PricingTier | null
  monthly_price_usd: number | null
  payment_status: PaymentStatus | null
  next_payment_due_date: string | null
  billing_status: BillingStatus
}

export interface MyOrgBilling {
  pricing_tier: PricingTier | null
  monthly_price_usd: number | null
  next_payment_due_date: string | null
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
