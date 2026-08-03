-- ============================================================================
-- Payment Verification Token system — every payment instance (initial
-- signup AND every subsequent renewal) gets its own short, unique,
-- human-typable payment_reference_code that the payer includes as a
-- reference/note when actually sending money, so the Super Admin can match
-- incoming bKash/bank statement lines back to the correct request when
-- manually verifying. Distinct from the existing long/unguessable
-- payment_token used purely for the /pay page URL's security.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.signup_requests add column if not exists payment_reference_code text unique;

-- Backfill existing rows so historical signup requests aren't left without a
-- code — same unambiguous character set (no 0/O, 1/I/L) the app itself uses
-- going forward, generated here with a simple retry-on-collision loop since
-- this is a one-time backfill, not a hot path.
do $$
declare
  r record;
  candidate text;
  charset text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  for r in select id from public.signup_requests where payment_reference_code is null loop
    loop
      candidate := '';
      for i in 1..9 loop
        candidate := candidate || substr(charset, 1 + floor(random() * length(charset))::int, 1);
      end loop;
      exit when not exists (select 1 from public.signup_requests where payment_reference_code = candidate);
    end loop;
    update public.signup_requests set payment_reference_code = candidate where id = r.id;
  end loop;
end $$;

alter table public.signup_requests alter column payment_reference_code set not null;

create table if not exists public.renewal_payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_reference_code text not null unique,
  payment_token text not null unique,
  amount_bdt numeric not null,
  extends_subscription_by text not null check (extends_subscription_by in ('1 month', '1 year')),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null
);
create index if not exists renewal_payment_requests_org_idx on public.renewal_payment_requests (organization_id, requested_at desc);
create index if not exists renewal_payment_requests_status_idx on public.renewal_payment_requests (status, requested_at desc);

alter table public.renewal_payment_requests enable row level security;
drop policy if exists "renewal_payment_requests select scoped" on public.renewal_payment_requests;
create policy "renewal_payment_requests select scoped" on public.renewal_payment_requests
  for select using (public.is_super_admin() or organization_id = public.current_org_id());
drop policy if exists "renewal_payment_requests insert scoped" on public.renewal_payment_requests;
create policy "renewal_payment_requests insert scoped" on public.renewal_payment_requests
  for insert with check (public.is_super_admin() or organization_id = public.current_org_id());
drop policy if exists "renewal_payment_requests update super admin only" on public.renewal_payment_requests;
create policy "renewal_payment_requests update super admin only" on public.renewal_payment_requests
  for update using (public.is_super_admin());

-- Every billing_history entry (whether from an initial approval or a
-- confirmed renewal) carries the reference code that was used to identify
-- it, so historical payments stay traceable back to the code the payer
-- actually typed into their bKash/bank transfer.
alter table public.billing_history add column if not exists payment_reference_code text;

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
  'renewal_payment_requested', 'renewal_payment_confirmed'
));
