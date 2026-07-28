-- ============================================================================
-- Platform-Wide Audit Log
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
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
    'data_export_triggered', 'bulk_leads_deleted'
  )),
  -- Who performed the action. Nullable for pre-auth events (a failed login
  -- attempt against an email with no matching account, a public request-form
  -- submission) and system-triggered events.
  actor_profile_id uuid references public.profiles(id) on delete set null,
  -- Snapshot of the actor's role AT THE TIME of the action, since a role can
  -- change (or the profile can be deleted) after the fact.
  actor_role text,
  organization_id uuid references public.organizations(id) on delete set null,
  -- The account affected by this action, when different from the actor
  -- (e.g. whose password/2FA/permissions/status changed).
  target_profile_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_event_type_idx on public.audit_log (event_type);
create index if not exists audit_log_organization_id_idx on public.audit_log (organization_id);
create index if not exists audit_log_actor_profile_id_idx on public.audit_log (actor_profile_id);

alter table public.audit_log enable row level security;

-- Platform-owner-only oversight tool — unlike export_log, Admins get zero
-- visibility here, even for events touching their own organization. There is
-- deliberately no insert/update/delete policy for any authenticated role:
-- every write happens server-side via the Service Role key (which bypasses
-- RLS entirely), so this table is append-only from the application's
-- perspective and can never be tampered with or edited through the UI.
drop policy if exists "audit_log super admin select only" on public.audit_log;
create policy "audit_log super admin select only"
  on public.audit_log for select
  using (public.is_super_admin());

-- Optional retention period (in days) for automatic cleanup — null means
-- "Forever" (the default), matching this app's small-scale expectations.
alter table public.platform_settings add column if not exists audit_log_retention_days integer;
