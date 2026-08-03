-- ============================================================================
-- In-App Announcements — Super Admin broadcasts a message to all
-- Organizations (or a targeted subset) through the existing Notification
-- Center, rather than a separate delivery mechanism. One announcement row
-- fans out into many individual `notifications` rows at publish time.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null check (audience in ('all', 'admins_only', 'specific_organizations', 'affiliates')),
  target_organization_ids jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);
create index if not exists announcements_created_at_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;
-- Recipients only ever interact with the notifications this fans out into,
-- never with this table directly — every policy here is Super-Admin-only.
drop policy if exists "announcements super admin only" on public.announcements;
create policy "announcements super admin only" on public.announcements
  for all using (public.is_super_admin()) with check (public.is_super_admin());

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
  'org_referral_reward_granted', 'org_referral_reward_skipped',
  'announcement_created', 'announcement_deactivated'
));
