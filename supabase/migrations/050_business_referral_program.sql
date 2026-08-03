-- ============================================================================
-- Coupon-based Team/Business Invite ("Refer a Business, Get a Free Month")
-- Entirely separate from the Affiliate Program (different table, different
-- reward mechanism — subscription time, not cash) even though the mechanics
-- rhyme: every Organization gets its own org_referral_code, clicks/signups
-- through it are tracked, and a successful conversion rewards free months
-- instead of a commission payout.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.organizations add column if not exists org_referral_code text unique;
alter table public.organizations add column if not exists referred_by_organization_id uuid references public.organizations(id) on delete set null;
-- Set on the REFERRED organization (not the referrer) the moment its first
-- payment triggers its referrer's reward — the unambiguous per-referral
-- marker of "did this specific referral earn a reward", since a referring
-- org's billing_history reward rows aren't individually attributable to
-- which referred business caused each one.
alter table public.organizations add column if not exists referral_reward_granted_at timestamptz;

-- Backfill existing organizations with a code so every current customer gets
-- the perk retroactively, not just ones created after this migration.
update public.organizations set org_referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  where org_referral_code is null;

alter table public.signup_requests add column if not exists referred_by_organization_id uuid references public.organizations(id) on delete set null;

-- Mirrors referral_clicks exactly, just keyed to an Organization instead of
-- an Affiliate — kept as its own table rather than reusing referral_clicks,
-- per this feature's explicit separation from the Affiliate Program.
create table if not exists public.org_referral_clicks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  ip_hash text,
  user_agent text
);
create index if not exists org_referral_clicks_org_idx on public.org_referral_clicks (organization_id, clicked_at desc);

alter table public.org_referral_clicks enable row level security;
drop policy if exists "org_referral_clicks select scoped" on public.org_referral_clicks;
create policy "org_referral_clicks select scoped" on public.org_referral_clicks
  for select using (public.is_super_admin() or organization_id = public.current_org_id());

-- Distinguishes an automatic referral-reward billing_history entry (amount
-- always 0, never real revenue) from an actual recorded payment.
alter table public.billing_history add column if not exists is_referral_reward boolean not null default false;

-- Same shared platform_settings row as Billing/Affiliate Program settings.
alter table public.platform_settings add column if not exists org_referral_program_enabled boolean not null default true;
alter table public.platform_settings add column if not exists org_referral_reward_months integer not null default 1;
alter table public.platform_settings add column if not exists org_referral_max_rewards integer;
alter table public.platform_settings add column if not exists org_referral_terms text;

alter table public.audit_log drop constraint if exists audit_log_event_type_check;
alter table public.audit_log add constraint audit_log_event_type_check check (event_type in (
  'login_success', 'login_failure', 'logout',
  'signup_request_submitted', 'signup_request_approved', 'signup_request_rejected',
  'admin_account_created', 'user_account_created',
  'team_member_deactivated', 'team_member_reactivated', 'team_member_deleted',
  'permissions_changed',
  'password_reset_request_submitted', 'password_reset_request_resolved',
  'mfa_reset_request_submitted', 'mfa_reset_request_resolved',
  'mfa_enabled', 'mfa_disabled', 'password_changed',
  'organization_created', 'organization_suspended', 'organization_reactivated', 'organization_deleted',
  'organization_branding_changed', 'platform_branding_changed',
  'data_export_triggered', 'bulk_leads_deleted',
  'leads_merged', 'deals_merged',
  'payment_recorded', 'payment_status_changed',
  'subscription_expired',
  'affiliate_application_submitted', 'affiliate_approved', 'affiliate_rejected',
  'affiliate_commission_generated', 'withdrawal_requested', 'withdrawal_status_changed',
  'product_review_submitted', 'product_review_reply_sent',
  'promo_code_created', 'promo_code_updated', 'promo_code_deleted',
  'cancellation_request_submitted', 'cancellation_request_acknowledged',
  'organization_subscription_cancelled', 'organization_subscription_reactivated',
  'refund_recorded',
  'org_referral_reward_granted', 'org_referral_reward_skipped'
));
