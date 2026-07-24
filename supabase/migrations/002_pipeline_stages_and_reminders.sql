-- ============================================================================
-- Leads CRM — Part 3: Pipeline stages, Kanban, follow-up reminders
-- Run this once in the Supabase SQL editor against a project that already has
-- schema.sql (Part 1) applied. Also folded into schema.sql for fresh installs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pipeline_stages: admin-configurable, ordered. Ships with the default sequence.
-- ----------------------------------------------------------------------------
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null,
  created_at timestamptz not null default now()
);

create unique index if not exists pipeline_stages_position_idx on public.pipeline_stages (position);

insert into public.pipeline_stages (name, position)
select name, position from (
  values
    ('Cold Email', 0),
    ('Follow-up 1', 1),
    ('Follow-up 2', 2),
    ('Follow-up 3', 3),
    ('Replied', 4),
    ('Converted', 5)
) as defaults(name, position)
where not exists (select 1 from public.pipeline_stages);

-- ----------------------------------------------------------------------------
-- leads.stage_id — current pipeline position. New leads default to the first
-- stage via the trigger below; existing leads are backfilled the same way.
-- ----------------------------------------------------------------------------
alter table public.leads add column if not exists stage_id uuid references public.pipeline_stages(id) on delete set null;

update public.leads
set stage_id = (select id from public.pipeline_stages order by position asc limit 1)
where stage_id is null;

create or replace function public.assign_default_stage()
returns trigger as $$
begin
  if new.stage_id is null then
    select id into new.stage_id from public.pipeline_stages order by position asc limit 1;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_lead_assign_stage on public.leads;
create trigger on_lead_assign_stage
  before insert on public.leads
  for each row execute procedure public.assign_default_stage();

-- ----------------------------------------------------------------------------
-- lead_status: suggested follow-up due-date columns. Computed and stored (not
-- derived on the fly) when the triggering flag is marked, using the interval
-- configured in app_settings at that moment — so changing the interval later
-- doesn't retroactively shift already-computed due dates.
-- ----------------------------------------------------------------------------
alter table public.lead_status add column if not exists followup1_due_at timestamptz;
alter table public.lead_status add column if not exists followup2_due_at timestamptz;
alter table public.lead_status add column if not exists followup3_due_at timestamptz;

-- ----------------------------------------------------------------------------
-- app_settings: singleton row (id is always 1) for app-wide configuration.
-- ----------------------------------------------------------------------------
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  follow_up_interval_days int not null default 3 check (follow_up_interval_days > 0),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — same read-only-for-authenticated pattern as every other table; all
-- writes go through the service-role key inside Netlify Functions.
-- ----------------------------------------------------------------------------
alter table public.pipeline_stages enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "authenticated users can read pipeline_stages" on public.pipeline_stages;
create policy "authenticated users can read pipeline_stages"
  on public.pipeline_stages for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can read app_settings" on public.app_settings;
create policy "authenticated users can read app_settings"
  on public.app_settings for select using (auth.role() = 'authenticated');
