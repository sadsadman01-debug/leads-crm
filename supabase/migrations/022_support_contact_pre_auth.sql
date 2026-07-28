-- ============================================================================
-- In-App Help/Support Widget — extend to pre-authentication screens
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- organization_id/profile_id are already nullable, so no change needed there
-- for the pre-auth (no session) case.
-- ============================================================================

alter table public.support_contacts
  add column if not exists source text not null default 'in_app' check (source in ('in_app', 'pre_auth')),
  add column if not exists request_ip text;

-- Used only server-side to throttle the unauthenticated endpoint — not
-- displayed anywhere, so no index needed beyond what a rare lookup requires.
create index if not exists support_contacts_source_ip_idx on public.support_contacts (source, request_ip, created_at);
