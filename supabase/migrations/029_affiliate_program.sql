-- ============================================================================
-- Affiliate Program
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('super_admin', 'admin', 'user', 'affiliate'));

-- Basic-info-only application — no payout details collected at this stage.
create table if not exists public.affiliate_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  how_they_plan_to_promote text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text
);
create index if not exists affiliate_applications_status_idx on public.affiliate_applications (status, applied_at desc);

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  full_name text not null,
  email text not null,
  referral_code text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);
create index if not exists affiliates_referral_code_idx on public.affiliates (referral_code);

create table if not exists public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  method_type text not null check (method_type in ('mfs', 'bank_account', 'crypto')),
  label text not null,
  details jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists payout_methods_affiliate_idx on public.payout_methods (affiliate_id);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  payout_method_id uuid not null references public.payout_methods(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'processing', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  actual_amount_sent_usd numeric(10, 2),
  notes text
);
create index if not exists withdrawal_requests_affiliate_idx on public.withdrawal_requests (affiliate_id, requested_at desc);
create index if not exists withdrawal_requests_status_idx on public.withdrawal_requests (status);

-- Per-request audit trail, distinct from the platform-wide Audit Log — this
-- one is scoped to a single withdrawal and shown directly in its detail view.
create table if not exists public.withdrawal_status_log (
  id uuid primary key default gen_random_uuid(),
  withdrawal_request_id uuid not null references public.withdrawal_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);
create index if not exists withdrawal_status_log_request_idx on public.withdrawal_status_log (withdrawal_request_id, changed_at);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  commission_type text not null check (commission_type in ('first_payment', 'recurring')),
  commission_amount_usd numeric(10, 2) not null,
  source_payment_amount_usd numeric(10, 2) not null,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_commissions_affiliate_idx on public.affiliate_commissions (affiliate_id, created_at desc);

-- Logged on every Request Access page load with a valid ?ref= — captures
-- link clicks even when the visitor never submits a request, which is
-- essential for an accurate conversion funnel. ip_hash only, never raw IP.
create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  ip_hash text,
  user_agent text
);
create index if not exists referral_clicks_affiliate_idx on public.referral_clicks (affiliate_id, clicked_at desc);

alter table public.signup_requests add column if not exists referred_by_affiliate_id uuid references public.affiliates(id) on delete set null;
alter table public.organizations add column if not exists referred_by_affiliate_id uuid references public.affiliates(id) on delete set null;

-- Counts recurring commissions already paid for this Organization, so a
-- capped recurring-duration setting can be enforced without re-scanning
-- billing_history on every payment.
alter table public.organizations add column if not exists affiliate_recurring_commissions_paid integer not null default 0;

alter table public.platform_settings add column if not exists affiliate_program_enabled boolean not null default false;
alter table public.platform_settings add column if not exists affiliate_first_payment_commission_pct numeric(5, 2) not null default 20;
alter table public.platform_settings add column if not exists affiliate_recurring_commission_pct numeric(5, 2) not null default 10;
alter table public.platform_settings add column if not exists affiliate_recurring_duration_type text not null default 'lifetime' check (affiliate_recurring_duration_type in ('lifetime', 'capped'));
alter table public.platform_settings add column if not exists affiliate_recurring_duration_count integer;
alter table public.platform_settings add column if not exists affiliate_min_withdrawal_usd numeric(10, 2);
alter table public.platform_settings add column if not exists affiliate_program_terms text;
alter table public.platform_settings add column if not exists affiliate_fb_post_template text;
alter table public.platform_settings add column if not exists affiliate_email_subject_template text;
alter table public.platform_settings add column if not exists affiliate_email_body_template text;
alter table public.platform_settings add column if not exists affiliate_promo_headline text;
alter table public.platform_settings add column if not exists affiliate_promo_subheadline text;

-- RLS: same convention as every other ops/audit table in this app (audit_log,
-- merge_snapshots, billing_history, duplicate_dismissals) — Super-Admin-only
-- visibility; every write happens server-side via the Service Role key
-- (bypassing RLS), and the backend enforces "own data only" scoping in code
-- for affiliate-facing endpoints, since affiliates never query these tables
-- directly.
alter table public.affiliate_applications enable row level security;
drop policy if exists "affiliate_applications super admin only" on public.affiliate_applications;
create policy "affiliate_applications super admin only" on public.affiliate_applications for select using (public.is_super_admin());

alter table public.affiliates enable row level security;
drop policy if exists "affiliates super admin only" on public.affiliates;
create policy "affiliates super admin only" on public.affiliates for select using (public.is_super_admin());

alter table public.payout_methods enable row level security;
drop policy if exists "payout_methods super admin only" on public.payout_methods;
create policy "payout_methods super admin only" on public.payout_methods for select using (public.is_super_admin());

alter table public.withdrawal_requests enable row level security;
drop policy if exists "withdrawal_requests super admin only" on public.withdrawal_requests;
create policy "withdrawal_requests super admin only" on public.withdrawal_requests for select using (public.is_super_admin());

alter table public.withdrawal_status_log enable row level security;
drop policy if exists "withdrawal_status_log super admin only" on public.withdrawal_status_log;
create policy "withdrawal_status_log super admin only" on public.withdrawal_status_log for select using (public.is_super_admin());

alter table public.affiliate_commissions enable row level security;
drop policy if exists "affiliate_commissions super admin only" on public.affiliate_commissions;
create policy "affiliate_commissions super admin only" on public.affiliate_commissions for select using (public.is_super_admin());

alter table public.referral_clicks enable row level security;
drop policy if exists "referral_clicks super admin only" on public.referral_clicks;
create policy "referral_clicks super admin only" on public.referral_clicks for select using (public.is_super_admin());

-- Atomic, race-safe balance check + reservation: runs as a single
-- transaction so two rapid submissions from the same affiliate can never
-- both pass against a stale balance. Locks the affiliate's own row first —
-- guaranteed to exist even for a first-ever withdrawal, unlike locking
-- withdrawal_requests rows (which wouldn't exist yet to lock on).
create or replace function public.request_affiliate_withdrawal(
  p_affiliate_id uuid,
  p_amount_usd numeric,
  p_payout_method_id uuid
) returns public.withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifetime_earned numeric;
  v_paid_out numeric;
  v_pending numeric;
  v_available numeric;
  v_row public.withdrawal_requests;
begin
  perform 1 from public.affiliates where id = p_affiliate_id for update;

  select coalesce(sum(commission_amount_usd), 0) into v_lifetime_earned
    from public.affiliate_commissions where affiliate_id = p_affiliate_id;

  select coalesce(sum(coalesce(actual_amount_sent_usd, amount_usd)), 0) into v_paid_out
    from public.withdrawal_requests where affiliate_id = p_affiliate_id and status = 'approved';

  select coalesce(sum(amount_usd), 0) into v_pending
    from public.withdrawal_requests where affiliate_id = p_affiliate_id and status in ('pending', 'processing');

  v_available := v_lifetime_earned - v_paid_out - v_pending;

  if p_amount_usd > v_available then
    raise exception 'Requested amount exceeds available balance' using errcode = 'P0001';
  end if;

  insert into public.withdrawal_requests (affiliate_id, amount_usd, payout_method_id, status)
  values (p_affiliate_id, p_amount_usd, p_payout_method_id, 'pending')
  returning * into v_row;

  insert into public.withdrawal_status_log (withdrawal_request_id, from_status, to_status, changed_by, note)
  values (v_row.id, null, 'pending', null, 'Requested by affiliate');

  return v_row;
end;
$$;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'signup_request', 'password_reset_request', 'lead_assigned', 'deal_assigned',
  'follow_up_overdue', 'deal_closing_soon', 'deal_closed_won', 'deal_closed_lost',
  'mfa_reset_request', 'affiliate_application', 'withdrawal_request'
));

alter table public.audit_log drop constraint if exists audit_log_event_type_check;
alter table public.audit_log add constraint audit_log_event_type_check check (event_type in (
  'login_success', 'login_failure', 'logout',
  'signup_request_submitted', 'signup_request_approved', 'signup_request_rejected',
  'admin_account_created', 'user_account_created',
  'team_member_deactivated', 'team_member_reactivated', 'team_member_deleted',
  'permissions_changed',
  'password_reset_request_submitted', 'password_reset_request_resolved',
  'mfa_reset_request_submitted', 'mfa_reset_request_resolved',
  'mfa_enabled', 'mfa_disabled',
  'organization_created', 'organization_suspended', 'organization_reactivated', 'organization_deleted',
  'organization_branding_changed', 'platform_branding_changed',
  'data_export_triggered', 'bulk_leads_deleted',
  'leads_merged', 'deals_merged',
  'payment_recorded', 'payment_status_changed',
  'subscription_expired',
  'affiliate_application_submitted', 'affiliate_approved', 'affiliate_rejected',
  'affiliate_commission_generated', 'withdrawal_requested', 'withdrawal_status_changed'
));
