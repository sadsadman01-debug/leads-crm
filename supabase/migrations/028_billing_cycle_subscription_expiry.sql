-- ============================================================================
-- Billing Cycle, Promotional Banner & Subscription Expiry Enforcement
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.platform_settings add column if not exists promotional_banner_text text;
alter table public.platform_settings add column if not exists grace_period_days integer not null default 0;

alter table public.signup_requests add column if not exists billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual'));
alter table public.signup_requests add column if not exists annual_total_usd numeric(10, 2);

alter table public.organizations add column if not exists billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual'));
alter table public.organizations add column if not exists annual_total_usd numeric(10, 2);
-- Supersedes next_payment_due_date (kept for now, no longer written to) with
-- correct monthly-vs-annual period math and a name that matches what it
-- actually gates: continued access to the app, not just a billing reminder.
alter table public.organizations add column if not exists subscription_end_date date;
update public.organizations set subscription_end_date = next_payment_due_date where subscription_end_date is null and next_payment_due_date is not null;

create index if not exists organizations_subscription_end_date_idx on public.organizations (subscription_end_date);

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
  'subscription_expired'
));
