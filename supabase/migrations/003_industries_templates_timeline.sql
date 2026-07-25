-- ============================================================================
-- Leads CRM — Part 4 catch-up (templates, activity timeline) + Part 5
-- (industry segmentation). Lead scoring is computed on the fly server-side —
-- no schema needed for it.
-- Run this once in the Supabase SQL editor against a project that already has
-- schema.sql + migrations 002 applied. Also folded into schema.sql for fresh installs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- industries: admin-configurable, referenced by leads (not free text) so a
-- rename propagates everywhere automatically.
-- ----------------------------------------------------------------------------
create table if not exists public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.leads add column if not exists industry_id uuid references public.industries(id) on delete set null;
create index if not exists leads_industry_id_idx on public.leads (industry_id);

-- ----------------------------------------------------------------------------
-- templates: reusable outreach copy (subject/body) with {{placeholder}} tokens
-- filled in client-side per lead. No email-sending infra — copy-to-clipboard only.
-- ----------------------------------------------------------------------------
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- lead_activities: append-only timeline per lead (status/stage/tag changes,
-- attachments, imports). Written by the functions layer at each mutation point.
-- ----------------------------------------------------------------------------
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  message text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_lead_id_idx on public.lead_activities (lead_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS — same read-only-for-authenticated pattern as every other table.
-- ----------------------------------------------------------------------------
alter table public.industries enable row level security;
alter table public.templates enable row level security;
alter table public.lead_activities enable row level security;

drop policy if exists "authenticated users can read industries" on public.industries;
create policy "authenticated users can read industries"
  on public.industries for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can read templates" on public.templates;
create policy "authenticated users can read templates"
  on public.templates for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can read lead_activities" on public.lead_activities;
create policy "authenticated users can read lead_activities"
  on public.lead_activities for select using (auth.role() = 'authenticated');
