export interface Organization {
  id: string
  name: string
  city: string
  country: string
  zip_code: string
  status: 'active' | 'suspended'
  created_at: string
}

export interface OrganizationSummary extends Organization {
  admin: { id: string; email: string; nickname: string | null } | null
  userCount: number
  leadCount: number
  dealCount: number
  openPipelineValue: number
  pricing_tier: 'early_bird' | 'standard' | null
  monthly_price_usd: number | null
  payment_status: 'pending' | 'received' | 'waived' | null
  subscription_end_date: string | null
  subscription_cancelled_at: string | null
  referred_by_affiliate_id: string | null
  referred_by_affiliate_name: string | null
}

export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'no_subscription'

/** Active/Cancelled/Expired/no-subscription-yet — a cancelled Organization
 * still shows "Cancelled" (not "Expired") even after its subscription_end_date
 * passes, since that distinction ("do we still expect a renewal?") is exactly
 * the point of tracking cancellation separately from plain expiry. */
export function computeSubscriptionStatus(subscriptionEndDate: string | null, subscriptionCancelledAt: string | null): SubscriptionStatus {
  if (subscriptionCancelledAt) return 'cancelled'
  if (!subscriptionEndDate) return 'no_subscription'
  return new Date(subscriptionEndDate) >= new Date() ? 'active' : 'expired'
}

export interface BrandPaletteColor {
  id: string
  label: string
  hex: string
}

export interface OrgBranding {
  logo_url: string | null
  accent_color: string | null
  display_name: string | null
  palette: BrandPaletteColor[]
}

export interface PlatformBranding {
  logo_url: string | null
  accent_color: string | null
  platform_name: string | null
  support_email: string | null
  audit_log_retention_days: number | null
  palette: BrandPaletteColor[]
}
