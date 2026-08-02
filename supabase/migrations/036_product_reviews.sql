-- ============================================================================
-- Product Reviews / Feedback System
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  review_number int not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  suggestions text,
  submitted_at timestamptz not null default now(),
  super_admin_reply text,
  replied_at timestamptz,
  replied_by uuid references public.profiles(id) on delete set null,
  unique (profile_id, review_number)
);

create index if not exists product_reviews_profile_id_idx on public.product_reviews (profile_id);
create index if not exists product_reviews_organization_id_idx on public.product_reviews (organization_id);
create index if not exists product_reviews_submitted_at_idx on public.product_reviews (submitted_at);

alter table public.product_reviews enable row level security;

drop policy if exists "product_reviews select own or super admin" on public.product_reviews;
create policy "product_reviews select own or super admin" on public.product_reviews
  for select using (public.is_super_admin() or profile_id = auth.uid());

drop policy if exists "product_reviews insert own" on public.product_reviews;
create policy "product_reviews insert own" on public.product_reviews
  for insert with check (profile_id = auth.uid() and (organization_id is null or organization_id = public.current_org_id()));

drop policy if exists "product_reviews update super admin only" on public.product_reviews;
create policy "product_reviews update super admin only" on public.product_reviews
  for update using (public.is_super_admin()) with check (public.is_super_admin());

-- All actual reads/writes happen server-side via the Service Role key (same
-- as every other table) — RLS here is defense-in-depth, mirroring the
-- "org isolation + row ownership" pattern already used for `leads`.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'signup_request', 'password_reset_request', 'lead_assigned', 'deal_assigned',
  'follow_up_overdue', 'deal_closing_soon', 'deal_closed_won', 'deal_closed_lost',
  'mfa_reset_request', 'affiliate_application', 'withdrawal_request', 'product_review_reply'
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
  'mfa_enabled', 'mfa_disabled', 'password_changed',
  'organization_created', 'organization_suspended', 'organization_reactivated', 'organization_deleted',
  'organization_branding_changed', 'platform_branding_changed',
  'data_export_triggered', 'bulk_leads_deleted',
  'leads_merged', 'deals_merged',
  'payment_recorded', 'payment_status_changed',
  'subscription_expired',
  'affiliate_application_submitted', 'affiliate_approved', 'affiliate_rejected',
  'affiliate_commission_generated', 'withdrawal_requested', 'withdrawal_status_changed',
  'product_review_submitted', 'product_review_reply_sent'
));
