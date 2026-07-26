-- ============================================================================
-- Phase 15: Forgot Password Request + Manual Resolve system
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

create table if not exists public.password_reset_requests (
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

create index if not exists password_reset_requests_status_idx on public.password_reset_requests (status);
create index if not exists password_reset_requests_org_idx on public.password_reset_requests (organization_id);

-- An Admin may only see/resolve User-role requests within their own
-- organization; the Super Admin sees/resolves everything, including every
-- Admin-role request platform-wide (no one else can act on those).
alter table public.password_reset_requests enable row level security;

drop policy if exists "password_reset_requests select scoped" on public.password_reset_requests;
create policy "password_reset_requests select scoped"
  on public.password_reset_requests for select
  using (
    public.is_super_admin()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

drop policy if exists "password_reset_requests update scoped" on public.password_reset_requests;
create policy "password_reset_requests update scoped"
  on public.password_reset_requests for update
  using (
    public.is_super_admin()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

-- No insert policy for authenticated/anon roles: the public "Forgot Password"
-- submission always goes through the service-role key inside the Netlify
-- Function (bypassing RLS entirely), exactly like signup_requests.
