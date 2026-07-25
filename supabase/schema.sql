-- ============================================================================
-- Leads CRM — Core Schema (Phase 1)
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles: mirrors auth.users. Kept separate (rather than hardcoding a single
-- admin id everywhere) so a future phase can add roles / multiple team members
-- without a schema migration on leads.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'admin' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'admin')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- pipeline_stages: admin-configurable, ordered Kanban columns. Ships with the
-- default sequence; created before `leads` since leads.stage_id references it.
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
-- industries: admin-configurable, referenced by leads (not free text) so a
-- rename propagates everywhere. Created before `leads` for the FK below.
-- ----------------------------------------------------------------------------
create table if not exists public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- leads
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  address text,
  phone text,
  email text,
  website text,
  notes text,
  lead_source text not null default 'Manual Entry'
    check (lead_source in ('Google Maps', 'Referral', 'Manual Entry', 'Website', 'Other')),
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  industry_id uuid references public.industries(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_industry_id_idx on public.leads (industry_id);

create index if not exists leads_company_name_idx on public.leads using gin (to_tsvector('simple', company_name));
create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists leads_created_at_idx on public.leads (created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute procedure public.set_updated_at();

-- Default every new lead to the first pipeline stage unless one was given explicitly.
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
-- social_profiles: multiple platform+url rows per lead
-- ----------------------------------------------------------------------------
create table if not exists public.lead_social_profiles (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  platform text not null, -- 'Facebook' | 'X/Twitter' | 'LinkedIn' | custom label
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists lead_social_profiles_lead_id_idx on public.lead_social_profiles (lead_id);

-- ----------------------------------------------------------------------------
-- tags: normalized so the same tag can be reused/autocompleted across leads
-- ----------------------------------------------------------------------------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_tags (
  lead_id uuid not null references public.leads(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (lead_id, tag_id)
);

-- ----------------------------------------------------------------------------
-- attachments: metadata only — binary files live in Supabase Storage
-- ----------------------------------------------------------------------------
create table if not exists public.lead_attachments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index if not exists lead_attachments_lead_id_idx on public.lead_attachments (lead_id);

-- ----------------------------------------------------------------------------
-- lead_status: one row per lead — outreach toggles, each with its own timestamp
-- ----------------------------------------------------------------------------
create table if not exists public.lead_status (
  lead_id uuid primary key references public.leads(id) on delete cascade,

  cold_email_sent boolean not null default false,
  cold_email_sent_at timestamptz,

  followup1_sent boolean not null default false,
  followup1_sent_at timestamptz,
  followup1_due_at timestamptz,

  followup2_sent boolean not null default false,
  followup2_sent_at timestamptz,
  followup2_due_at timestamptz,

  followup3_sent boolean not null default false,
  followup3_sent_at timestamptz,
  followup3_due_at timestamptz,

  replied boolean not null default false,
  replied_at timestamptz,
  reply_sentiment text check (reply_sentiment in ('Positive', 'Neutral', 'Negative', 'Not Interested')),

  whatsapp_sent boolean not null default false,
  whatsapp_sent_at timestamptz,

  no_whatsapp boolean not null default false,
  no_whatsapp_at timestamptz,

  email_invalid boolean not null default false,
  email_invalid_at timestamptz,

  phone_invalid boolean not null default false,
  phone_invalid_at timestamptz,

  converted boolean not null default false,
  converted_at timestamptz,

  linkedin_sent boolean not null default false,
  linkedin_sent_at timestamptz,

  sms_sent boolean not null default false,
  sms_sent_at timestamptz,

  cold_call_made boolean not null default false,
  cold_call_made_at timestamptz,
  cold_call_outcome text check (cold_call_outcome in ('No Answer', 'Interested', 'Not Interested', 'Call Back Later')),

  updated_at timestamptz not null default now()
);

drop trigger if exists lead_status_set_updated_at on public.lead_status;
create trigger lead_status_set_updated_at
  before update on public.lead_status
  for each row execute procedure public.set_updated_at();

-- Auto-create a status row whenever a lead is created.
create or replace function public.handle_new_lead()
returns trigger as $$
begin
  insert into public.lead_status (lead_id) values (new.id)
  on conflict (lead_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_lead_created on public.leads;
create trigger on_lead_created
  after insert on public.leads
  for each row execute procedure public.handle_new_lead();

-- ----------------------------------------------------------------------------
-- app_settings: singleton row (id is always 1) for app-wide configuration,
-- e.g. the follow-up reminder interval.
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

-- ============================================================================
-- Row Level Security
-- All tables are locked down; the Netlify Functions API uses the Supabase
-- service-role key (which bypasses RLS) so the frontend never talks to
-- Postgres directly. RLS still guards against the anon/public key being
-- misused, and gives a straightforward base to build per-user policies on
-- top of in a future multi-user phase.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_social_profiles enable row level security;
alter table public.tags enable row level security;
alter table public.lead_tags enable row level security;
alter table public.lead_attachments enable row level security;
alter table public.lead_status enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.app_settings enable row level security;
alter table public.industries enable row level security;
alter table public.templates enable row level security;
alter table public.lead_activities enable row level security;

create policy "authenticated users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "authenticated users can read leads"
  on public.leads for select using (auth.role() = 'authenticated');
create policy "authenticated users can read social profiles"
  on public.lead_social_profiles for select using (auth.role() = 'authenticated');
create policy "authenticated users can read tags"
  on public.tags for select using (auth.role() = 'authenticated');
create policy "authenticated users can read lead_tags"
  on public.lead_tags for select using (auth.role() = 'authenticated');
create policy "authenticated users can read attachments"
  on public.lead_attachments for select using (auth.role() = 'authenticated');
create policy "authenticated users can read lead_status"
  on public.lead_status for select using (auth.role() = 'authenticated');
create policy "authenticated users can read pipeline_stages"
  on public.pipeline_stages for select using (auth.role() = 'authenticated');
create policy "authenticated users can read app_settings"
  on public.app_settings for select using (auth.role() = 'authenticated');
create policy "authenticated users can read industries"
  on public.industries for select using (auth.role() = 'authenticated');
create policy "authenticated users can read templates"
  on public.templates for select using (auth.role() = 'authenticated');
create policy "authenticated users can read lead_activities"
  on public.lead_activities for select using (auth.role() = 'authenticated');

-- No insert/update/delete policies are defined for the anon/authenticated
-- roles: all writes go through the service-role key inside Netlify Functions.

-- ============================================================================
-- Storage bucket for note attachments (screenshots, PDFs, etc.)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('lead-attachments', 'lead-attachments', false)
on conflict (id) do nothing;

create policy "service role manages lead-attachments"
  on storage.objects for all
  using (bucket_id = 'lead-attachments' and auth.role() = 'service_role');
