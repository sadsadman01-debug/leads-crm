-- ============================================================================
-- Refund & Cancellation Tracking
-- Fully manual (no payment gateway) — this only adds tracking/status
-- management so an Organization's subscription state and the Super Admin's
-- Earnings figures stay accurate when money is refunded or a customer
-- cancels. Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- "Cancelled" is set manually by the Super Admin once they've processed a
-- cancellation — it does NOT touch subscription_end_date; access continues
-- exactly as already enforced until that date naturally passes. Distinct
-- from organizations.status ('active'/'suspended', an account-access toggle
-- unrelated to billing intent).
alter table public.organizations add column if not exists subscription_cancelled_at timestamptz;

create table if not exists public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  additional_comments text,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'acknowledged')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index if not exists cancellation_requests_org_idx on public.cancellation_requests (organization_id, requested_at desc);

alter table public.cancellation_requests enable row level security;
drop policy if exists "cancellation_requests super admin only" on public.cancellation_requests;
create policy "cancellation_requests super admin only" on public.cancellation_requests
  for select using (public.is_super_admin());

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_history_id uuid references public.billing_history(id) on delete set null,
  amount_bdt numeric(10, 2) not null check (amount_bdt > 0),
  refund_date date not null,
  reason text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists refunds_org_idx on public.refunds (organization_id, refund_date desc);
create index if not exists refunds_refund_date_idx on public.refunds (refund_date desc);

alter table public.refunds enable row level security;
drop policy if exists "refunds super admin only" on public.refunds;
create policy "refunds super admin only" on public.refunds
  for select using (public.is_super_admin());

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
  'refund_recorded'
));
