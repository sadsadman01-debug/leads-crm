-- ============================================================================
-- Two-Factor Authentication (TOTP) — MFA Reset Requests (lockout recovery)
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Enrollment/challenge/unenroll itself uses Supabase Auth's built-in MFA
-- tables (auth.mfa_factors etc.) directly — nothing to create for that part.
-- ============================================================================

create table if not exists public.mfa_reset_requests (
  id uuid primary key default gen_random_uuid(),
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_email text not null,
  target_role text not null check (target_role in ('admin', 'user')),
  organization_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists mfa_reset_requests_status_idx on public.mfa_reset_requests (status);
create index if not exists mfa_reset_requests_org_idx on public.mfa_reset_requests (organization_id);

alter table public.mfa_reset_requests enable row level security;

-- Same routing rule as password_reset_requests: Super Admin sees everything;
-- an Admin only sees User-role requests within their own organization. No
-- insert policy — rows are only ever created via the service-role client
-- from the public "Locked out of Two-Factor Authentication?" submission.
drop policy if exists "mfa_reset_requests select scoped" on public.mfa_reset_requests;
create policy "mfa_reset_requests select scoped"
  on public.mfa_reset_requests for select
  using (
    public.is_super_admin()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

drop policy if exists "mfa_reset_requests update scoped" on public.mfa_reset_requests;
create policy "mfa_reset_requests update scoped"
  on public.mfa_reset_requests for update
  using (
    public.is_super_admin()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

-- Add the new notification type alongside the existing ones.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'signup_request', 'password_reset_request', 'mfa_reset_request', 'lead_assigned', 'deal_assigned',
    'follow_up_overdue', 'deal_closing_soon', 'deal_closed_won', 'deal_closed_lost'
  ));
