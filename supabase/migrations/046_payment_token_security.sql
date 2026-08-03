-- ============================================================================
-- Public Payment Form/Link — security hardening
-- (1) payment_token already exists (migration 045) — no schema change needed
--     for that part; this migration only adds per-IP throttling for the
--     public "I've Completed My Payment" submission endpoint.
-- (2) A small dedicated attempts log, mirroring the exact DB-backed
--     count-by-IP-and-window pattern already used for support_contacts'
--     pre-auth submissions and password-reset-requests — no in-memory
--     counting, since serverless functions don't reliably persist that
--     across invocations.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.payment_method_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_method_submission_attempts_ip_idx on public.payment_method_submission_attempts (ip, created_at desc);

alter table public.payment_method_submission_attempts enable row level security;

-- Nothing ever reads this back through the app — it exists purely for the
-- Service Role client's own throttle-count query — but every table in this
-- app has RLS enabled for defense-in-depth consistency, so lock it down the
-- same way as everything else rather than leaving it wide open.
drop policy if exists "payment_method_submission_attempts super admin only" on public.payment_method_submission_attempts;
create policy "payment_method_submission_attempts super admin only" on public.payment_method_submission_attempts
  for select using (public.is_super_admin());
