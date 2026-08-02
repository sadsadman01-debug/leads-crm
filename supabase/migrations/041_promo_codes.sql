-- ============================================================================
-- Promo Codes + Payment Method tracking
-- Adds configurable promo codes (flat/percent discounts) applicable at
-- signup, plus manual payment-method selection at approval/payment time —
-- lays groundwork for a future revenue-analytics dashboard and a future
-- public payment-link form (neither built here).
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('flat', 'percent')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  is_active boolean not null default true,
  times_used integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.promo_codes enable row level security;

-- Reads are Super-Admin-only (the public "validate" check happens server-side
-- via the Service Role key, never a direct client query); all writes also go
-- through the Service Role key, same as billing_history.
drop policy if exists "promo_codes select super admin only" on public.promo_codes;
create policy "promo_codes select super admin only" on public.promo_codes
  for select using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Discount fields — locked in at signup-request SUBMISSION time (same
-- convention as pricing_tier/billing_cycle), then carried onto the
-- Organization at approval time. payment_method is set at approval time.
-- ---------------------------------------------------------------------------
alter table public.signup_requests add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;
alter table public.signup_requests add column if not exists promo_code_text text;
alter table public.signup_requests add column if not exists original_price_bdt numeric(10, 2);
alter table public.signup_requests add column if not exists discount_amount_bdt numeric(10, 2) not null default 0;
alter table public.signup_requests add column if not exists final_price_bdt numeric(10, 2);
alter table public.signup_requests add column if not exists payment_method text
  check (payment_method in ('bkash', 'nagad', 'rocket', 'bank_transfer', 'payoneer', 'crypto', 'other'));

alter table public.organizations add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;
alter table public.organizations add column if not exists promo_code_text text;
alter table public.organizations add column if not exists original_price_bdt numeric(10, 2);
alter table public.organizations add column if not exists discount_amount_bdt numeric(10, 2) not null default 0;
alter table public.organizations add column if not exists final_price_bdt numeric(10, 2);
alter table public.organizations add column if not exists payment_method text
  check (payment_method in ('bkash', 'nagad', 'rocket', 'bank_transfer', 'payoneer', 'crypto', 'other'));

-- Every payment (first and every renewal) going forward records which
-- channel it actually arrived through — nullable, since historical rows
-- predate this and are left as-is.
alter table public.billing_history add column if not exists payment_method text
  check (payment_method in ('bkash', 'nagad', 'rocket', 'bank_transfer', 'payoneer', 'crypto', 'other'));

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
  'promo_code_created', 'promo_code_updated', 'promo_code_deleted'
));
