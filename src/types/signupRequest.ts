import type { PricingTier, PaymentStatus, BillingCycle } from './billing'

export type SignupRequestStatus = 'pending' | 'approved' | 'rejected'

export interface SignupRequest {
  id: string
  organization_name: string
  contact_name: string
  email: string
  phone: string | null
  message: string | null
  status: SignupRequestStatus
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  pricing_tier: PricingTier | null
  monthly_price_usd: number | null
  payment_status: PaymentStatus
  billing_cycle: BillingCycle
  annual_total_usd: number | null
  referred_by_affiliate_id: string | null
  referred_by_affiliate_name?: string | null
}

export interface ApproveSignupRequestResult {
  request: SignupRequest
  organization: {
    id: string
    name: string
    pricing_tier: PricingTier | null
    monthly_price_usd: number | null
    billing_cycle: BillingCycle | null
    annual_total_usd: number | null
    payment_status: PaymentStatus | null
    subscription_end_date: string | null
  }
  admin: { email: string; nickname: string; temporary_password: string }
}
