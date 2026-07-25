-- ============================================================================
-- Phase 10: Custom fields on Leads/Deals
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  applies_to text not null check (applies_to in ('leads', 'deals', 'both')),
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'dropdown', 'multiselect', 'checkbox', 'url', 'textarea')),
  options jsonb, -- array of strings, only meaningful for dropdown/multiselect
  required boolean not null default false,
  default_value text,
  display_order int not null default 0,
  is_active boolean not null default true, -- soft-delete: hides from forms/builder, preserves historical values
  created_at timestamptz not null default now()
);

create index if not exists custom_field_definitions_org_idx on public.custom_field_definitions (organization_id);

alter table public.leads add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.deals add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists leads_custom_fields_idx on public.leads using gin (custom_fields);
create index if not exists deals_custom_fields_idx on public.deals using gin (custom_fields);

-- ----------------------------------------------------------------------------
-- RLS — same pattern as the other settings-type tables (Phase 8): readable
-- within your own organization, writable only by admins/super admins.
-- ----------------------------------------------------------------------------
alter table public.custom_field_definitions enable row level security;

drop policy if exists "custom_field_definitions select scoped" on public.custom_field_definitions;
create policy "custom_field_definitions select scoped"
  on public.custom_field_definitions for select
  using (public.is_super_admin() or organization_id = public.current_org_id());

drop policy if exists "custom_field_definitions insert admin scoped" on public.custom_field_definitions;
drop policy if exists "custom_field_definitions update admin scoped" on public.custom_field_definitions;
drop policy if exists "custom_field_definitions delete admin scoped" on public.custom_field_definitions;
create policy "custom_field_definitions insert admin scoped"
  on public.custom_field_definitions for insert
  with check (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));
create policy "custom_field_definitions update admin scoped"
  on public.custom_field_definitions for update
  using (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));
create policy "custom_field_definitions delete admin scoped"
  on public.custom_field_definitions for delete
  using (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));
