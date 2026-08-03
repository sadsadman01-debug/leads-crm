import type { PricingTier, PaymentStatus, BillingCycle, PaymentMethod } from './billing'

export type SignupRequestStatus = 'pending' | 'approved' | 'rejected'

export interface SignupRequest {
  id: string
  organization_name: string
  contact_name: string
  email: string
  phone: string | null
  message: string | null
  city: string
  country: string
  zip_code: string
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
  promo_code_id: string | null
  promo_code_text: string | null
  original_price_bdt: number | null
  discount_amount_bdt: number
  final_price_bdt: number | null
  payment_method: PaymentMethod | null
  /** Non-guessable token used ONLY for the public /pay link — never the
   * plain `id`, so leaking/guessing it can't expose or tamper with another
   * applicant's payment flow. */
  payment_token: string
}

export interface ApproveSignupRequestResult {
  request: SignupRequest
  organization: {
    id: string
    name: string
    city: string
    country: string
    zip_code: string
    pricing_tier: PricingTier | null
    monthly_price_usd: number | null
    billing_cycle: BillingCycle | null
    annual_total_usd: number | null
    payment_status: PaymentStatus | null
    subscription_end_date: string | null
    promo_code_id: string | null
    promo_code_text: string | null
    original_price_bdt: number | null
    discount_amount_bdt: number
    final_price_bdt: number | null
    payment_method: PaymentMethod | null
  }
  admin: { email: string; nickname: string; temporary_password: string }
}
