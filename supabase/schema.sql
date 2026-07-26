-- ============================================================================
-- Leads CRM — Core Schema (Phase 1)
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ----------------------------------------------------------------------------
-- organizations: one row per tenant/customer. The Super Admin belongs to none
-- (their own leads/deals/settings use organization_id = null instead).
-- Created before `profiles` for the FK below.
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  -- Organization Branding / White-label
  logo_storage_path text,
  accent_color text,
  display_name text,
  -- Onboarding Checklist — step completion is computed live from existing
  -- data on every read; only these two are persisted.
  onboarding_dismissed boolean not null default false,
  onboarding_completed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- profiles: mirrors auth.users. Kept separate (rather than hardcoding a single
-- admin id everywhere) so a future phase can add roles / multiple team members
-- without a schema migration on leads.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  nickname text,
  role text not null default 'user' check (role in ('super_admin', 'admin', 'user')),
  is_active boolean not null default true,
  organization_id uuid references public.organizations(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  force_password_change boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.organizations add constraint organizations_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- Global Search — trigram indexes for fast ILIKE '%term%' substring matching.
create index if not exists profiles_nickname_trgm_idx on public.profiles using gin (nickname gin_trgm_ops);
create index if not exists profiles_email_trgm_idx on public.profiles using gin (email gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- signup_requests: public "Request Access" submissions from the Login page,
-- reviewed manually by the Super Admin (approve/reject) — no email verification
-- or outbound email of any kind, ever, from this app. Platform-level (no
-- organization_id — this predates any organization existing for the request).
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- password_reset_requests: public "Forgot Password" submissions from the Login
-- page, routed to whoever can act on them (the requester's own org Admin(s)
-- for a User target, or only the Super Admin for an Admin target) and manually
-- resolved with a fresh temporary password — no outbound email, ever.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- mfa_reset_requests: Two-Factor Authentication lockout recovery — the exact
-- same shape/routing as password_reset_requests above, for when a user loses
-- their authenticator device. Enrollment/challenge/unenroll itself uses
-- Supabase Auth's built-in MFA tables directly; nothing to create for that.
-- ----------------------------------------------------------------------------
create table if not exists public.mfa_reset_requests (
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

create index if not exists mfa_reset_requests_status_idx on public.mfa_reset_requests (status);
create index if not exists mfa_reset_requests_org_idx on public.mfa_reset_requests (organization_id);

-- ----------------------------------------------------------------------------
-- notifications: the unified, role-aware Notification Center. One row per
-- recipient per event — an org-wide event (e.g. a Deal closing) fans out to
-- one row per Admin, not one shared row, so read/unread state is per-person.
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  type text not null check (type in (
    'signup_request', 'password_reset_request', 'mfa_reset_request', 'lead_assigned', 'deal_assigned',
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
create index if not exists notifications_dedup_idx on public.notifications (recipient_profile_id, type, related_entity_id, created_at);

-- Auto-create a profile row whenever a new auth user is created. New accounts
-- default to 'user' — the Team Management "add member" function immediately
-- updates role/nickname right after this trigger runs. The single Super Admin
-- is seeded separately (scripts/seed-admin.mjs) and promoted manually.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
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
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists pipeline_stages_org_position_idx on public.pipeline_stages (organization_id, position);

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
  name text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists industries_org_name_unique on public.industries (organization_id, name);

-- ----------------------------------------------------------------------------
-- leads
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
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
  assigned_to uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete cascade,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_custom_fields_idx on public.leads using gin (custom_fields);
create index if not exists leads_industry_id_idx on public.leads (industry_id);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
create index if not exists leads_organization_id_idx on public.leads (organization_id);

create index if not exists leads_company_name_idx on public.leads using gin (to_tsvector('simple', company_name));
create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_email_idx on public.leads (lower(email));

-- Global Search — trigram indexes for fast ILIKE '%term%' substring matching.
create index if not exists leads_company_name_trgm_idx on public.leads using gin (company_name gin_trgm_ops);
create index if not exists leads_contact_name_trgm_idx on public.leads using gin (contact_name gin_trgm_ops);
create index if not exists leads_email_trgm_idx on public.leads using gin (email gin_trgm_ops);
create index if not exists leads_phone_trgm_idx on public.leads using gin (phone gin_trgm_ops);
create index if not exists leads_address_trgm_idx on public.leads using gin (address gin_trgm_ops);
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
  name text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists tags_org_name_unique on public.tags (organization_id, name);

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
-- app_settings: one row per organization, plus one row (organization_id null)
-- for the Super Admin's personal scope — created on first access, not seeded here.
-- ----------------------------------------------------------------------------
create sequence if not exists app_settings_id_seq;

create table if not exists public.app_settings (
  id integer primary key default nextval('app_settings_id_seq'),
  organization_id uuid references public.organizations(id) on delete cascade,
  follow_up_interval_days int not null default 3 check (follow_up_interval_days > 0),
  default_currency text not null default 'USD',
  updated_at timestamptz not null default now()
);

create unique index if not exists app_settings_org_unique on public.app_settings (organization_id) where organization_id is not null;
create unique index if not exists app_settings_personal_unique on public.app_settings ((organization_id is null)) where organization_id is null;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- platform_settings: Platform Default Branding — a single platform-wide row
-- (not per-organization), Super-Admin-only. Logos live in the 'org-logos'
-- bucket under a `platform/` path prefix (no separate bucket needed).
-- ----------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  platform_logo_storage_path text,
  platform_accent_color text,
  platform_name text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- templates: reusable outreach copy (subject/body) with {{placeholder}} tokens
-- filled in client-side per lead. No email-sending infra — copy-to-clipboard only.
-- ----------------------------------------------------------------------------
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body text not null default '',
  template_type text not null default 'cold_email'
    check (template_type in ('cold_email', 'followup1', 'followup2', 'followup3', 'whatsapp', 'linkedin', 'sms')),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_organization_id_idx on public.templates (organization_id);
create index if not exists templates_template_type_idx on public.templates (template_type);

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
-- deal_stages: separate, admin-configurable pipeline from lead pipeline_stages.
-- is_closed/is_won are booleans (not name-matching) so renaming a stage never
-- breaks "is this deal closed" logic. Created before `deals` for the FK below.
-- ----------------------------------------------------------------------------
create table if not exists public.deal_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null,
  default_probability int not null default 0 check (default_probability between 0 and 100),
  is_closed boolean not null default false,
  is_won boolean not null default false,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists deal_stages_org_position_idx on public.deal_stages (organization_id, position);

insert into public.deal_stages (name, position, default_probability, is_closed, is_won)
select name, position, default_probability, is_closed, is_won from (
  values
    ('Qualification', 0, 20, false, false),
    ('Needs Analysis', 1, 40, false, false),
    ('Proposal Sent', 2, 50, false, false),
    ('Negotiation', 3, 75, false, false),
    ('Closed Won', 4, 100, true, true),
    ('Closed Lost', 5, 0, true, false)
) as defaults(name, position, default_probability, is_closed, is_won)
where not exists (select 1 from public.deal_stages);

-- ----------------------------------------------------------------------------
-- custom_field_definitions: admin-defined extra fields on Leads/Deals, values
-- stored in the `custom_fields` jsonb column added to each table below.
-- is_active is a soft-delete flag: hides the field from forms/the builder
-- without destroying whatever historical values are already stored.
-- ----------------------------------------------------------------------------
create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  applies_to text not null check (applies_to in ('leads', 'deals', 'both')),
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'dropdown', 'multiselect', 'checkbox', 'url', 'textarea')),
  options jsonb,
  required boolean not null default false,
  default_value text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists custom_field_definitions_org_idx on public.custom_field_definitions (organization_id);

-- ----------------------------------------------------------------------------
-- saved_reports: custom report builder configurations.
-- ----------------------------------------------------------------------------
create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  report_type text not null check (report_type in ('leads', 'deals', 'activity')),
  selected_fields jsonb not null default '[]'::jsonb,
  group_by text,
  filters jsonb not null default '{}'::jsonb,
  chart_type text not null default 'table' check (chart_type in ('table', 'bar', 'line', 'donut', 'table_and_chart')),
  visible_to_all boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_reports_org_idx on public.saved_reports (organization_id);

drop trigger if exists saved_reports_set_updated_at on public.saved_reports;
create trigger saved_reports_set_updated_at
  before update on public.saved_reports
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- quotas: org-wide (user_id null) or per-team-member revenue goals, by month
-- ("2026-07") or quarter ("2026-Q3") period_key.
-- ----------------------------------------------------------------------------
create table if not exists public.quotas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  period_type text not null check (period_type in ('month', 'quarter')),
  period_key text not null,
  amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quotas_org_user_period_unique
  on public.quotas (organization_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), period_type, period_key);

drop trigger if exists quotas_set_updated_at on public.quotas;
create trigger quotas_set_updated_at
  before update on public.quotas
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- win_loss_reasons: admin-editable suggestion list. Deals store outcome_reason
-- as free text (so "Other: <custom text>" always works) rather than an FK.
-- ----------------------------------------------------------------------------
create table if not exists public.win_loss_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists win_loss_reasons_org_label_unique on public.win_loss_reasons (organization_id, label);

insert into public.win_loss_reasons (label)
select label from (
  values
    ('Price too high'),
    ('Went with competitor'),
    ('Bad timing'),
    ('Budget cut'),
    ('Won on relationship'),
    ('Won on pricing')
) as defaults(label)
where not exists (select 1 from public.win_loss_reasons);

-- ----------------------------------------------------------------------------
-- deals: linked to a lead. A lead may have zero, one, or many deals over time.
-- ----------------------------------------------------------------------------
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  name text not null,
  value numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  stage_id uuid references public.deal_stages(id) on delete set null,
  probability int not null default 0 check (probability between 0 and 100),
  expected_close_date date,
  actual_close_date date,
  outcome_reason text,
  owner_id uuid references public.profiles(id) on delete set null,
  notes text,
  organization_id uuid references public.organizations(id) on delete cascade,
  -- Locked-in exchange rates at the moment this deal closed, so historical
  -- revenue reporting never silently shifts as live rates fluctuate. Null
  -- while the deal is still open.
  closed_exchange_rate_snapshot jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_custom_fields_idx on public.deals using gin (custom_fields);
create index if not exists deals_lead_id_idx on public.deals (lead_id);
create index if not exists deals_stage_id_idx on public.deals (stage_id);
create index if not exists deals_expected_close_date_idx on public.deals (expected_close_date);
create index if not exists deals_owner_id_idx on public.deals (owner_id);
create index if not exists deals_organization_id_idx on public.deals (organization_id);
create index if not exists deals_name_trgm_idx on public.deals using gin (name gin_trgm_ops);

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
  before update on public.deals
  for each row execute procedure public.set_updated_at();

-- Default every new deal to the first deal stage (and its default probability)
-- unless given explicitly.
create or replace function public.assign_default_deal_stage()
returns trigger as $$
declare
  first_stage record;
begin
  if new.stage_id is null then
    select id, default_probability into first_stage from public.deal_stages order by position asc limit 1;
    new.stage_id := first_stage.id;
    if new.probability = 0 then
      new.probability := first_stage.default_probability;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_deal_assign_stage on public.deals;
create trigger on_deal_assign_stage
  before insert on public.deals
  for each row execute procedure public.assign_default_deal_stage();

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
alter table public.deal_stages enable row level security;
alter table public.win_loss_reasons enable row level security;
alter table public.deals enable row level security;
alter table public.organizations enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.saved_reports enable row level security;
alter table public.quotas enable row level security;

-- Role-check / org-check helper functions, used by policies below and
-- re-checked independently server-side by every sensitive Netlify Function.
create or replace function public.current_user_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_above()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'), false);
$$;

create or replace function public.current_org_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'super_admin', false);
$$;

-- Reads the caller's permissions jsonb (empty object for admins/super admins —
-- they never consult it, since is_admin_or_above() always short-circuits first).
create or replace function public.my_permissions()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(permissions, '{}'::jsonb) from public.profiles where id = auth.uid();
$$;

-- organizations: only the Super Admin can read/write it.
create policy "organizations super admin only"
  on public.organizations for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- platform_settings: only the Super Admin can read/write it (the public
-- pre-login pages read Platform Default Branding via a service-role-backed
-- Netlify Function instead, bypassing RLS, same as organizations.name today).
alter table public.platform_settings enable row level security;
create policy "platform_settings super admin only"
  on public.platform_settings for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

alter table public.signup_requests enable row level security;
create policy "signup_requests super admin only"
  on public.signup_requests for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- password_reset_requests: an Admin only sees/resolves User-role requests
-- within their own organization; the Super Admin sees/resolves everything,
-- including every Admin-role request platform-wide. No insert policy for
-- authenticated/anon roles — the public submission always goes through the
-- service-role key inside the Netlify Function, bypassing RLS entirely.
alter table public.password_reset_requests enable row level security;
create policy "password_reset_requests select scoped"
  on public.password_reset_requests for select
  using (
    public.is_super_admin()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );
create policy "password_reset_requests update scoped"
  on public.password_reset_requests for update
  using (
    public.is_super_admin()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

-- mfa_reset_requests: identical routing/RLS shape to password_reset_requests.
alter table public.mfa_reset_requests enable row level security;
create policy "mfa_reset_requests select scoped"
  on public.mfa_reset_requests for select
  using (
    public.is_super_admin()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );
create policy "mfa_reset_requests update scoped"
  on public.mfa_reset_requests for update
  using (
    public.is_super_admin()
    or (target_role = 'user' and public.is_admin_or_above() and organization_id = public.current_org_id())
  );

-- notifications: a profile may only ever see/update their own — never another
-- account's, never across organizations. No insert policy for authenticated/
-- anon roles — creation always goes through the service-role key.
alter table public.notifications enable row level security;
create policy "notifications select own"
  on public.notifications for select
  using (recipient_profile_id = auth.uid());
create policy "notifications update own"
  on public.notifications for update
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

-- Enables Supabase Realtime (Postgres change subscriptions, free on every
-- plan) so the bell updates instantly without polling.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- profiles: scoped to own organization; Super Admin sees everyone; everyone
-- can always read their own row (needed for login/profile checks).
create policy "profiles select scoped"
  on public.profiles for select
  using (
    public.is_super_admin()
    or id = auth.uid()
    or (organization_id is not null and organization_id = public.current_org_id())
  );

-- Every org-scoped table: readable only within your own organization (Super Admin bypasses).
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'deals', 'pipeline_stages', 'deal_stages', 'industries', 'templates', 'win_loss_reasons', 'tags', 'app_settings', 'custom_field_definitions', 'quotas']
  loop
    execute format(
      'create policy "%s select scoped" on public.%I for select using (public.is_super_admin() or organization_id = public.current_org_id())',
      t, t
    );
  end loop;
end $$;

-- Lead-scoped sub-tables have no organization_id of their own — they inherit
-- scope from their parent lead via a join.
create policy "authenticated users can read social profiles"
  on public.lead_social_profiles for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and (public.is_super_admin() or l.organization_id = public.current_org_id())
  ));
create policy "authenticated users can read lead_tags"
  on public.lead_tags for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and (public.is_super_admin() or l.organization_id = public.current_org_id())
  ));
create policy "authenticated users can read attachments"
  on public.lead_attachments for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and (public.is_super_admin() or l.organization_id = public.current_org_id())
  ));
create policy "authenticated users can read lead_status"
  on public.lead_status for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and (public.is_super_admin() or l.organization_id = public.current_org_id())
  ));
create policy "authenticated users can read lead_activities"
  on public.lead_activities for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and (public.is_super_admin() or l.organization_id = public.current_org_id())
  ));

-- leads: select additionally respects leadVisibility ('all' default vs 'own');
-- insert requires organization scoping; update/delete respect canEditAny
-- (only meaningful when visibility='all') and canDelete, plus the existing
-- admin-or-above / assigned-owner-or-creator checks. The plain "select scoped"
-- policy from the generic org-scoped loop above is replaced by this one.
drop policy if exists "leads select scoped" on public.leads;
create policy "leads select scoped"
  on public.leads for select
  using (
    public.is_super_admin()
    or (
      organization_id = public.current_org_id()
      and (
        public.is_admin_or_above()
        or coalesce(public.my_permissions()->>'leadVisibility', 'all') = 'all'
        or assigned_to = auth.uid()
        or created_by = auth.uid()
      )
    )
  );
create policy "leads insert scoped" on public.leads for insert
  with check (public.is_super_admin() or organization_id = public.current_org_id());
create policy "leads update by owner or admin scoped" on public.leads for update
  using (
    (public.is_super_admin() or organization_id = public.current_org_id())
    and (
      public.is_admin_or_above()
      or assigned_to = auth.uid()
      or created_by = auth.uid()
      or (
        coalesce(public.my_permissions()->>'leadVisibility', 'all') = 'all'
        and coalesce((public.my_permissions()->>'canEditAny')::boolean, false)
      )
    )
  );
create policy "leads delete by owner or admin scoped" on public.leads for delete
  using (
    (public.is_super_admin() or organization_id = public.current_org_id())
    and (
      public.is_admin_or_above()
      or (
        coalesce((public.my_permissions()->>'canDelete')::boolean, true)
        and (
          assigned_to = auth.uid()
          or created_by = auth.uid()
          or (
            coalesce(public.my_permissions()->>'leadVisibility', 'all') = 'all'
            and coalesce((public.my_permissions()->>'canEditAny')::boolean, false)
          )
        )
      )
    )
  );

-- deals: same pattern, keyed on dealVisibility/owner_id (deals have no
-- separate created_by column — owner_id is the sole ownership field).
drop policy if exists "deals select scoped" on public.deals;
create policy "deals select scoped"
  on public.deals for select
  using (
    public.is_super_admin()
    or (
      organization_id = public.current_org_id()
      and (
        public.is_admin_or_above()
        or coalesce(public.my_permissions()->>'dealVisibility', 'all') = 'all'
        or owner_id = auth.uid()
      )
    )
  );
create policy "deals insert scoped" on public.deals for insert
  with check (public.is_super_admin() or organization_id = public.current_org_id());
create policy "deals update by owner or admin scoped" on public.deals for update
  using (
    (public.is_super_admin() or organization_id = public.current_org_id())
    and (
      public.is_admin_or_above()
      or owner_id = auth.uid()
      or (
        coalesce(public.my_permissions()->>'dealVisibility', 'all') = 'all'
        and coalesce((public.my_permissions()->>'canEditAny')::boolean, false)
      )
    )
  );
create policy "deals delete by owner or admin scoped" on public.deals for delete
  using (
    (public.is_super_admin() or organization_id = public.current_org_id())
    and (
      public.is_admin_or_above()
      or (
        coalesce((public.my_permissions()->>'canDelete')::boolean, true)
        and (
          owner_id = auth.uid()
          or (
            coalesce(public.my_permissions()->>'dealVisibility', 'all') = 'all'
            and coalesce((public.my_permissions()->>'canEditAny')::boolean, false)
          )
        )
      )
    )
  );

-- Settings-type tables that stay permanently admin-only (not delegatable via
-- granular User permissions): readable within your org (above), writable only
-- by admins/super admins within that same organization.
do $$
declare
  t text;
begin
  foreach t in array array['win_loss_reasons', 'app_settings', 'quotas']
  loop
    execute format(
      'create policy "%s insert admin scoped" on public.%I for insert with check (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()))',
      t, t
    );
    execute format(
      'create policy "%s update admin scoped" on public.%I for update using (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()))',
      t, t
    );
    execute format(
      'create policy "%s delete admin scoped" on public.%I for delete using (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()))',
      t, t
    );
  end loop;
end $$;

-- Settings-type tables that a User can be granted delegated write access to via
-- the matching granular permission flag, on top of the existing admin-or-above check.
do $$
declare
  cfg record;
begin
  for cfg in
    select * from (values
      ('templates', 'canManageTemplates'),
      ('pipeline_stages', 'canManageStages'),
      ('deal_stages', 'canManageStages'),
      ('industries', 'canManageIndustries'),
      ('custom_field_definitions', 'canManageCustomFields')
    ) as t(table_name, perm_key)
  loop
    execute format(
      'create policy "%s insert admin scoped" on public.%I for insert with check (' ||
      'public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()) ' ||
      'or (organization_id = public.current_org_id() and coalesce((public.my_permissions()->>%L)::boolean, false)))',
      cfg.table_name, cfg.table_name, cfg.perm_key
    );
    execute format(
      'create policy "%s update admin scoped" on public.%I for update using (' ||
      'public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()) ' ||
      'or (organization_id = public.current_org_id() and coalesce((public.my_permissions()->>%L)::boolean, false)))',
      cfg.table_name, cfg.table_name, cfg.perm_key
    );
    execute format(
      'create policy "%s delete admin scoped" on public.%I for delete using (' ||
      'public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()) ' ||
      'or (organization_id = public.current_org_id() and coalesce((public.my_permissions()->>%L)::boolean, false)))',
      cfg.table_name, cfg.table_name, cfg.perm_key
    );
  end loop;
end $$;

-- No insert/update/delete policies are defined for the remaining lead-scoped
-- sub-tables (social profiles, tags, attachments, status, activities): all
-- writes to those go through the service-role key inside Netlify Functions,
-- which independently re-checks the parent lead's organization/permission
-- before writing.

-- saved_reports: readable by its creator, any admin-or-above in the org, or
-- anyone in the org when explicitly marked visible_to_all. Writable by
-- admins/super admins, or by a User granted canAccessReportBuilder — but such
-- a User may only update/delete reports they themselves created.
create policy "saved_reports select scoped"
  on public.saved_reports for select
  using (
    public.is_super_admin()
    or (organization_id = public.current_org_id() and (visible_to_all or created_by = auth.uid() or public.is_admin_or_above()))
  );
create policy "saved_reports insert admin scoped" on public.saved_reports for insert
  with check (
    public.is_super_admin()
    or (public.is_admin_or_above() and organization_id = public.current_org_id())
    or (organization_id = public.current_org_id() and coalesce((public.my_permissions()->>'canAccessReportBuilder')::boolean, false))
  );
create policy "saved_reports update admin scoped" on public.saved_reports for update
  using (
    public.is_super_admin()
    or (public.is_admin_or_above() and organization_id = public.current_org_id())
    or (
      organization_id = public.current_org_id()
      and created_by = auth.uid()
      and coalesce((public.my_permissions()->>'canAccessReportBuilder')::boolean, false)
    )
  );
create policy "saved_reports delete admin scoped" on public.saved_reports for delete
  using (
    public.is_super_admin()
    or (public.is_admin_or_above() and organization_id = public.current_org_id())
    or (
      organization_id = public.current_org_id()
      and created_by = auth.uid()
      and coalesce((public.my_permissions()->>'canAccessReportBuilder')::boolean, false)
    )
  );

-- ----------------------------------------------------------------------------
-- exchange_rates: platform-wide (not organization-scoped) cache of the free
-- ExchangeRate-API open endpoint, refreshed by a Netlify Function whenever
-- stale (>~20h old). Always exactly one row (id = 1).
-- ----------------------------------------------------------------------------
create table if not exists public.exchange_rates (
  id smallint primary key default 1 check (id = 1),
  base_currency text not null default 'USD',
  rates jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.exchange_rates enable row level security;
create policy "authenticated users can read exchange_rates"
  on public.exchange_rates for select using (auth.role() = 'authenticated');
-- No write policy: only the service-role key (inside the Netlify Function) ever writes this table.

-- ============================================================================
-- Storage bucket for note attachments (screenshots, PDFs, etc.)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('lead-attachments', 'lead-attachments', false)
on conflict (id) do nothing;

create policy "service role manages lead-attachments"
  on storage.objects for all
  using (bucket_id = 'lead-attachments' and auth.role() = 'service_role');

-- ============================================================================
-- Storage bucket for Organization Branding logos — public-read (logos aren't
-- sensitive), write-only via the service role.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

create policy "service role manages org-logos"
  on storage.objects for all
  using (bucket_id = 'org-logos' and auth.role() = 'service_role');
