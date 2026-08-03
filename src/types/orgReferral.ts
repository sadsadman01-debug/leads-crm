// Business Referral Program ("Refer a Business, Get a Free Month") — entirely
// separate from the Affiliate Program's data model, even though the mechanics
// rhyme (referral codes, click tracking). Reward is free subscription months,
// not cash commission, and any existing paying Organization is eligible with
// no application/approval step.

export interface OrgReferralSettings {
  id: string
  org_referral_program_enabled: boolean
  org_referral_reward_months: number
  org_referral_max_rewards: number | null
  org_referral_terms: string | null
}

export interface MyReferralInfo {
  org_referral_code: string | null
  program_enabled: boolean
  reward_months: number
  terms: string | null
  stats: {
    total_referred: number
    converted: number
    months_earned: number
  }
  referrals: Array<{
    id: string
    organization_name: string
    status: string
    requested_at: string
    reward_earned: boolean
  }>
}
