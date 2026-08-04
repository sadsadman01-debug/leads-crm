-- ============================================================================
-- Reworks In-App Announcements delivery: instead of fanning out into
-- Notification Center rows, an active Announcement is now surfaced as a
-- dismissible banner at the top of the recipient's own Dashboard (or
-- Affiliate Dashboard, for audience = 'affiliates'), resolved by a live query
-- rather than a one-time fan-out insert. This table tracks per-profile
-- dismissals so a dismissed announcement never reappears for that person.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.announcement_dismissals (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  unique (announcement_id, profile_id)
);
create index if not exists announcement_dismissals_profile_idx on public.announcement_dismissals (profile_id);

alter table public.announcement_dismissals enable row level security;

-- A profile may only ever see/insert their own dismissal records — never
-- another account's. Writes here go through the service-role key inside
-- Netlify Functions (bypassing RLS) exactly like every other request/queue
-- table in this app, but the select policy still matters for any direct
-- client-side read.
drop policy if exists "announcement dismissals select own" on public.announcement_dismissals;
create policy "announcement dismissals select own" on public.announcement_dismissals
  for select using (profile_id = auth.uid());

drop policy if exists "announcement dismissals insert own" on public.announcement_dismissals;
create policy "announcement dismissals insert own" on public.announcement_dismissals
  for insert with check (profile_id = auth.uid());
