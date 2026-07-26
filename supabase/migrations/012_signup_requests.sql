-- ============================================================================
-- Phase 14: Signup Request + Manual Approval system
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text
);

create index if not exists signup_requests_status_idx on public.signup_requests (status);

alter table public.profiles add column if not exists force_password_change boolean not null default false;

-- Platform-level table (no organization_id — this predates any organization
-- existing) — restricted to the Super Admin only, both as the actual
-- enforcement (every route in netlify/functions/routes/signupRequests.ts
-- independently calls requireSuperAdmin) and as this RLS backstop.
alter table public.signup_requests enable row level security;
drop policy if exists "signup_requests super admin only" on public.signup_requests;
create policy "signup_requests super admin only"
  on public.signup_requests for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
