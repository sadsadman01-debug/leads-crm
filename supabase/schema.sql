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
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

  followup2_sent boolean not null default false,
  followup2_sent_at timestamptz,

  followup3_sent boolean not null default false,
  followup3_sent_at timestamptz,

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
