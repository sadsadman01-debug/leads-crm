-- ============================================================================
-- Manual Billing & Pricing Tiers
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Billing configuration lives on the same single platform-wide row as
-- Platform Branding (platform_settings) — same lazy-create-on-first-access
-- pattern, just more fields on the same row.
alter table public.platform_settings add column if not exists payment_instructions text;
alter table public.platform_settings add column if not exists early_bird_threshold integer not null default 50;
alter table public.platform_settings add column if not exists early_bird_price_usd numeric(10, 2) not null default 5;
alter table public.platform_settings add column if not exists standard_price_usd numeric(10, 2) not null default 10;

-- Pricing tier is locked in at submission time, not approval time.
alter table public.signup_requests add column if not exists pricing_tier text check (pricing_tier in ('early_bird', 'standard'));
alter table public.signup_requests add column if not exists monthly_price_usd numeric(10, 2);
alter table public.signup_requests add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending', 'received', 'waived'));

-- Copied onto the Organization at approval time, plus ongoing tracking fields.
alter table public.organizations add column if not exists pricing_tier text check (pricing_tier in ('early_bird', 'standard'));
alter table public.organizations add column if not exists monthly_price_usd numeric(10, 2);
alter table public.organizations add column if not exists payment_status text check (payment_status in ('pending', 'received', 'waived'));
alter table public.organizations add column if not exists first_payment_confirmed_at timestamptz;
alter table public.organizations add column if not exists next_payment_due_date date;

create table if not exists public.billing_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  amount_usd numeric(10, 2) not null,
  paid_at date not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists billing_history_org_idx on public.billing_history (organization_id, paid_at desc);

alter table public.billing_history enable row level security;

-- Super-Admin-only — Admins/Users get only the narrow read-only fields
-- exposed by the /billing/my-organization endpoint, never raw table access.
drop policy if exists "billing_history super admin only" on public.billing_history;
create policy "billing_history super admin only"
  on public.billing_history for select
  using (public.is_super_admin());

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
  'payment_recorded', 'payment_status_changed'
));
