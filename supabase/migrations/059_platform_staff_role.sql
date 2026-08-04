-- ============================================================================
-- Platform Staff — a new top-level account type, alongside Super Admin,
-- Admin, User, and Affiliate. Staff belongs to no Organization (like Super
-- Admin) but has a deliberately restricted permission set: full access to
-- day-to-day operational screens (Signup Requests, Password/MFA Reset
-- Requests, Support Contacts, Affiliate Applications, Affiliates,
-- Withdrawal Requests, Product Reviews, Announcements), and ZERO access to
-- financial/billing/audit/organization-management screens (Earnings, Promo
-- Codes, Billing Settings, Audit Log, Payment Accounts, Affiliate Program
-- Settings, Organizations, Settings, Cancellation/Refund handling).
--
-- As with every other role in this app, the actual enforcement is the
-- Netlify Functions' own requireSuperAdmin/requireSuperAdminOrStaff checks
-- (they use the Service Role key, bypassing RLS) — these RLS policies are a
-- defense-in-depth backstop, not the primary authorization mechanism.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('super_admin', 'admin', 'user', 'affiliate', 'staff'));

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'staff', false);
$$;

-- ---------------------------------------------------------------------------
-- Staff-accessible tables: extend the existing Super-Admin-only RLS to also
-- allow Staff. Every table NOT listed here (organizations, promo_codes,
-- audit_log, platform_settings/billing tables, receiving_payment_accounts,
-- affiliate program settings columns on platform_settings) deliberately
-- keeps its is_super_admin()-only policy untouched — Staff is blocked there
-- by simply not being mentioned, both at the RLS layer and (primarily) by
-- the corresponding Netlify Function's requireSuperAdmin gate.
-- ---------------------------------------------------------------------------

drop policy if exists "signup_requests super admin only" on public.signup_requests;
create policy "signup_requests super admin only"
  on public.signup_requests for all
  using (public.is_super_admin() or public.is_staff())
  with check (public.is_super_admin() or public.is_staff());

drop policy if exists "password_reset_requests select scoped" on public.password_reset_requests;
create policy "password_reset_requests select scoped"
  on public.password_reset_requests for select
  using (
    public.is_super_admin() or public.is_staff()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

drop policy if exists "password_reset_requests update scoped" on public.password_reset_requests;
create policy "password_reset_requests update scoped"
  on public.password_reset_requests for update
  using (
    public.is_super_admin() or public.is_staff()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

drop policy if exists "mfa_reset_requests select scoped" on public.mfa_reset_requests;
create policy "mfa_reset_requests select scoped"
  on public.mfa_reset_requests for select
  using (
    public.is_super_admin() or public.is_staff()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

drop policy if exists "mfa_reset_requests update scoped" on public.mfa_reset_requests;
create policy "mfa_reset_requests update scoped"
  on public.mfa_reset_requests for update
  using (
    public.is_super_admin() or public.is_staff()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

-- Staff only ever VIEWS this log (per spec — no delete access), so the
-- original single "for all" policy is split: a select policy Staff can pass,
-- and a separate super-admin-only policy for the destructive delete-all
-- action (deleteAllSupportContacts stays gated by requireSuperAdmin, never
-- requireSuperAdminOrStaff, at the application layer too).
drop policy if exists "support_contacts super admin only" on public.support_contacts;
drop policy if exists "support_contacts select" on public.support_contacts;
create policy "support_contacts select"
  on public.support_contacts for select
  using (public.is_super_admin() or public.is_staff());

drop policy if exists "support_contacts delete super admin only" on public.support_contacts;
create policy "support_contacts delete super admin only"
  on public.support_contacts for delete
  using (public.is_super_admin());

-- No insert policy for authenticated/anon roles — every row is created via
-- the service-role client from the public/pre-auth support contact form,
-- same as before this migration.

drop policy if exists "affiliate_applications super admin only" on public.affiliate_applications;
create policy "affiliate_applications super admin only" on public.affiliate_applications
  for select using (public.is_super_admin() or public.is_staff());

drop policy if exists "affiliates super admin only" on public.affiliates;
create policy "affiliates super admin only" on public.affiliates
  for select using (public.is_super_admin() or public.is_staff());

drop policy if exists "payout_methods super admin only" on public.payout_methods;
create policy "payout_methods super admin only" on public.payout_methods
  for select using (public.is_super_admin() or public.is_staff());

drop policy if exists "withdrawal_requests super admin only" on public.withdrawal_requests;
create policy "withdrawal_requests super admin only" on public.withdrawal_requests
  for select using (public.is_super_admin() or public.is_staff());

drop policy if exists "withdrawal_status_log super admin only" on public.withdrawal_status_log;
create policy "withdrawal_status_log super admin only" on public.withdrawal_status_log
  for select using (public.is_super_admin() or public.is_staff());

drop policy if exists "product_reviews select own or super admin" on public.product_reviews;
create policy "product_reviews select own or super admin" on public.product_reviews
  for select using (public.is_super_admin() or public.is_staff() or profile_id = auth.uid());

drop policy if exists "product_reviews update super admin only" on public.product_reviews;
create policy "product_reviews update super admin only" on public.product_reviews
  for update using (public.is_super_admin() or public.is_staff()) with check (public.is_super_admin() or public.is_staff());

drop policy if exists "announcements super admin only" on public.announcements;
create policy "announcements super admin only" on public.announcements
  for all using (public.is_super_admin() or public.is_staff()) with check (public.is_super_admin() or public.is_staff());

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
  'announcement_created', 'announcement_deactivated',
  'renewal_payment_requested', 'renewal_payment_confirmed',
  'staff_account_created', 'staff_account_deactivated', 'staff_account_reactivated', 'staff_account_deleted'
));
