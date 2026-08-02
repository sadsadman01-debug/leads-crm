export type AffiliateApplicationStatus = 'pending' | 'approved' | 'rejected'
export type AffiliateStatus = 'active' | 'suspended'
export type PayoutMethodType = 'mfs' | 'bank_account' | 'crypto'
export type WithdrawalStatus = 'pending' | 'processing' | 'approved' | 'rejected'
export type CommissionType = 'first_payment' | 'recurring'

export interface AffiliateApplication {
  id: string
  full_name: string
  email: string
  how_they_plan_to_promote: string | null
  city: string
  country: string
  zip_code: string
  status: AffiliateApplicationStatus
  applied_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
}

export interface ApproveAffiliateApplicationResult {
  application: AffiliateApplication
  affiliate: Affiliate
  admin: { email: string; nickname: string; temporary_password: string }
}

export interface Affiliate {
  id: string
  profile_id: string
  full_name: string
  email: string
  referral_code: string
  city: string
  country: string
  zip_code: string
  status: AffiliateStatus
  created_at: string
}

export interface MfsDetails {
  provider: string
  account_number: string
  account_holder_name: string | null
}
export interface BankAccountDetails {
  account_holder_name: string
  bank_name: string
  branch_name: string
  account_number: string
  routing_number: string
}
export interface CryptoDetails {
  network: string
  wallet_address: string
}
export type PayoutMethodDetails = MfsDetails | BankAccountDetails | CryptoDetails

export interface PayoutMethod {
  id: string
  affiliate_id: string
  method_type: PayoutMethodType
  label: string
  details: Record<string, any>
  is_default: boolean
  created_at: string
}

export interface WithdrawalRequest {
  id: string
  affiliate_id: string
  amount_usd: number
  payout_method_id: string
  status: WithdrawalStatus
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  actual_amount_sent_usd: number | null
  notes: string | null
  payout_method?: { id: string; method_type: PayoutMethodType; label: string } | null
  affiliate?: { id: string; full_name: string; email: string; referral_code: string } | null
}

export interface WithdrawalStatusLogEntry {
  id: string
  from_status: WithdrawalStatus | null
  to_status: WithdrawalStatus
  changed_by: string | null
  changed_by_name: string | null
  changed_at: string
  note: string | null
}

export interface WithdrawalDetail {
  request: WithdrawalRequest
  affiliate: { id: string; full_name: string; email: string; referral_code: string } | null
  payout_method: PayoutMethod | null
  status_log: WithdrawalStatusLogEntry[]
}

export interface AffiliateBalances {
  lifetimeEarned: number
  thisMonthEarned: number
  totalPaidOut: number
  pendingWithdrawal: number
  availableBalance: number
}

export interface FunnelCounts {
  clicks: number
  requests: number
  completed: number
}

export interface TrendPoint {
  date: string
  clicks: number
  requests: number
}

export interface AffiliateDashboardSummary {
  affiliate: Affiliate
  balances: AffiliateBalances
  lastMonthEarned: number
  funnel: FunnelCounts
  trend: TrendPoint[]
  minWithdrawalUsd: number | null
}

export interface AffiliateWithSummary extends Affiliate {
  balances: AffiliateBalances
  funnel: FunnelCounts
}

export interface AffiliateDetail {
  affiliate: Affiliate
  balances: AffiliateBalances
  funnel: FunnelCounts
  trend: TrendPoint[]
}

export interface Referral {
  id: string
  name: string
  status: 'active' | 'suspended'
  created_at: string
  first_payment_confirmed_at: string | null
  commission_earned_usd: number
}

export type RecurringDurationType = 'lifetime' | 'capped'

export interface AffiliateSettings {
  id: string
  affiliate_program_enabled: boolean
  affiliate_first_payment_commission_pct: number
  affiliate_recurring_commission_pct: number
  affiliate_recurring_duration_type: RecurringDurationType
  affiliate_recurring_duration_count: number | null
  affiliate_min_withdrawal_usd: number | null
  affiliate_program_terms: string | null
  affiliate_fb_post_template: string | null
  affiliate_email_subject_template: string | null
  affiliate_email_body_template: string | null
  affiliate_promo_headline: string | null
  affiliate_promo_subheadline: string | null
}

export interface PublicAffiliateProgramInfo {
  enabled: boolean
  terms: string | null
  first_payment_commission_pct: number
  recurring_commission_pct: number
}

export interface MarketingMaterials {
  facebook_post: string
  email_subject: string
  email_body: string
  image_prompt: string
  program_terms: string | null
}

export const PAYOUT_METHOD_LABELS: Record<PayoutMethodType, string> = {
  mfs: 'Mobile Financial Service',
  bank_account: 'Bank Account',
  crypto: 'Cryptocurrency Wallet',
}

export const MFS_PROVIDERS = ['bKash', 'Nagad', 'Rocket', 'Upay', 'Other']
export const CRYPTO_NETWORKS = ['USDT (TRC20)', 'USDT (ERC20)', 'USDT (BEP20)', 'Bitcoin (BTC)', 'Ethereum (ETH)', 'Other']

export function maskPayoutDetails(methodType: PayoutMethodType, details: Record<string, any>): string {
  if (methodType === 'mfs') {
    const d = details as MfsDetails
    const last4 = d.account_number?.slice(-4) ?? '----'
    return `${d.provider} •••• ${last4}`
  }
  if (methodType === 'bank_account') {
    const d = details as BankAccountDetails
    const last4 = d.account_number?.slice(-4) ?? '----'
    return `${d.bank_name} •••• ${last4}`
  }
  const d = details as CryptoDetails
  const addr = d.wallet_address ?? ''
  const truncated = addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr
  return `${d.network} ${truncated}`
}
