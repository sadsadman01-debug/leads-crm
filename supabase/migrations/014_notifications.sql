-- ============================================================================
-- Phase 16: Notification Center
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  type text not null check (type in (
    'signup_request', 'password_reset_request', 'lead_assigned', 'deal_assigned',
    'follow_up_overdue', 'deal_closing_soon', 'deal_closed_won', 'deal_closed_lost'
  )),
  title text not null,
  message text not null,
  link_route text,
  related_entity_id uuid,
  related_entity_type text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_profile_id, created_at desc);
create index if not exists notifications_recipient_unread_idx on public.notifications (recipient_profile_id, is_read);
-- Dedup lookups (e.g. "has this deal already gotten a deal_closing_soon notification",
-- "has this recipient already gotten today's follow_up_overdue digest").
create index if not exists notifications_dedup_idx on public.notifications (recipient_profile_id, type, related_entity_id, created_at);

-- A profile may only ever see/update their own notifications — never another
-- account's, never across organizations. Creation always goes through the
-- service-role key inside Netlify Functions (bypassing RLS), same as every
-- other request/queue-type table in this app, so no insert policy is needed
-- for authenticated/anon roles.
alter table public.notifications enable row level security;

drop policy if exists "notifications select own" on public.notifications;
create policy "notifications select own"
  on public.notifications for select
  using (recipient_profile_id = auth.uid());

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own"
  on public.notifications for update
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

-- Enables Supabase Realtime (Postgres change subscriptions, free on every
-- plan) so the bell updates instantly without polling. Guarded because
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member —
-- unlike CREATE/DROP, there's no IF NOT EXISTS form for this statement.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
