-- ============================================================================
-- Phase 8: Multi-tenant Organizations (SaaS conversion)
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- organizations: one row per tenant/customer. Super Admin belongs to none.
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- profiles.organization_id: null for Super Admin, required for Admin/User.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Auto-migrate any Admin/User accounts created before Organizations existed
-- (Part 7's single shared workspace) into one Default Organization, so they
-- remain valid — every Admin/User must now belong to exactly one org.
do $$
declare
  default_org_id uuid;
  legacy_super_admin_id uuid;
begin
  if exists (select 1 from public.profiles where role in ('admin', 'user') and organization_id is null) then
    select id into legacy_super_admin_id from public.profiles where role = 'super_admin' limit 1;

    insert into public.organizations (name, created_by, status)
    values ('Default Organization', legacy_super_admin_id, 'active')
    returning id into default_org_id;

    update public.profiles set organization_id = default_org_id
      where role in ('admin', 'user') and organization_id is null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- organization_id on every previously shared table. New columns default to
-- NULL, which — per the migration requirement — makes all pre-existing leads,
-- deals, industries, pipeline/deal stages, templates, win/loss reasons, and
-- tags private to the Super Admin (created under the original single-admin
-- account) rather than visible to the newly-separated Default Organization.
-- ----------------------------------------------------------------------------
alter table public.leads add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.deals add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.pipeline_stages add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.deal_stages add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.industries add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.templates add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.win_loss_reasons add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.tags add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create index if not exists leads_organization_id_idx on public.leads (organization_id);
create index if not exists deals_organization_id_idx on public.deals (organization_id);
create index if not exists pipeline_stages_organization_id_idx on public.pipeline_stages (organization_id);
create index if not exists deal_stages_organization_id_idx on public.deal_stages (organization_id);
create index if not exists industries_organization_id_idx on public.industries (organization_id);
create index if not exists templates_organization_id_idx on public.templates (organization_id);
create index if not exists win_loss_reasons_organization_id_idx on public.win_loss_reasons (organization_id);
create index if not exists tags_organization_id_idx on public.tags (organization_id);
create index if not exists profiles_organization_id_idx on public.profiles (organization_id);

-- tags.name was globally unique; now unique per-organization (and per-null/personal scope).
-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so drop-then-add to stay rerunnable.
alter table public.tags drop constraint if exists tags_name_key;
alter table public.tags drop constraint if exists tags_org_name_unique;
alter table public.tags add constraint tags_org_name_unique unique (organization_id, name);

-- Pipeline/deal stage position and industry name were globally unique; now scoped per organization.
drop index if exists pipeline_stages_position_idx;
create unique index if not exists pipeline_stages_org_position_idx on public.pipeline_stages (organization_id, position);
drop index if exists deal_stages_position_idx;
create unique index if not exists deal_stages_org_position_idx on public.deal_stages (organization_id, position);
alter table public.industries drop constraint if exists industries_name_key;
alter table public.industries drop constraint if exists industries_org_name_unique;
alter table public.industries add constraint industries_org_name_unique unique (organization_id, name);
alter table public.win_loss_reasons drop constraint if exists win_loss_reasons_label_key;
alter table public.win_loss_reasons drop constraint if exists win_loss_reasons_org_label_unique;
alter table public.win_loss_reasons add constraint win_loss_reasons_org_label_unique unique (organization_id, label);

-- ----------------------------------------------------------------------------
-- app_settings: was a single global singleton row; now one row per organization
-- plus one row (organization_id is null) for the Super Admin's personal scope.
-- ----------------------------------------------------------------------------
alter table public.app_settings drop constraint if exists app_settings_id_check;
alter table public.app_settings add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
create sequence if not exists app_settings_id_seq;
select setval('app_settings_id_seq', greatest((select coalesce(max(id), 1) from public.app_settings), 1));
alter table public.app_settings alter column id drop default;
alter table public.app_settings alter column id set default nextval('app_settings_id_seq');
create unique index if not exists app_settings_org_unique on public.app_settings (organization_id) where organization_id is not null;
create unique index if not exists app_settings_personal_unique on public.app_settings ((organization_id is null)) where organization_id is null;

-- ----------------------------------------------------------------------------
-- Role-check / org-check helper functions, used by RLS policies below.
-- ----------------------------------------------------------------------------
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

-- ============================================================================
-- RLS policy rework: every scoped table's select/write policies now also
-- require organization_id to match the caller's own organization (Super Admin
-- bypasses this entirely). Netlify Functions independently re-check role AND
-- organization_id server-side before every write — RLS is the database-level
-- backstop the spec calls for.
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'deals', 'pipeline_stages', 'deal_stages', 'industries', 'templates', 'win_loss_reasons', 'tags', 'app_settings']
  loop
    execute format('drop policy if exists "authenticated users can read %s" on public.%I', t, t);
    execute format('drop policy if exists "%s select scoped" on public.%I', t, t);
    execute format(
      'create policy "%s select scoped" on public.%I for select using (public.is_super_admin() or organization_id = public.current_org_id())',
      t, t
    );
  end loop;
end $$;

-- profiles: scoped to own organization (plus Super Admin sees everyone, and
-- everyone can always read their own row regardless of org, for login/profile checks).
drop policy if exists "authenticated users can read profiles" on public.profiles;
drop policy if exists "profiles select scoped" on public.profiles;
create policy "profiles select scoped"
  on public.profiles for select
  using (
    public.is_super_admin()
    or id = auth.uid()
    or (organization_id is not null and organization_id = public.current_org_id())
  );

-- leads/deals write policies: add organization scoping alongside the existing
-- role/ownership checks from Phase 7.
drop policy if exists "leads insert by authenticated" on public.leads;
drop policy if exists "leads update by owner or admin" on public.leads;
drop policy if exists "leads delete by owner or admin" on public.leads;
drop policy if exists "leads insert scoped" on public.leads;
drop policy if exists "leads update by owner or admin scoped" on public.leads;
drop policy if exists "leads delete by owner or admin scoped" on public.leads;
create policy "leads insert scoped"
  on public.leads for insert
  with check (public.is_super_admin() or organization_id = public.current_org_id());
create policy "leads update by owner or admin scoped"
  on public.leads for update
  using (
    (public.is_super_admin() or organization_id = public.current_org_id())
    and (public.is_admin_or_above() or assigned_to = auth.uid() or created_by = auth.uid())
  );
create policy "leads delete by owner or admin scoped"
  on public.leads for delete
  using (
    (public.is_super_admin() or organization_id = public.current_org_id())
    and (public.is_admin_or_above() or assigned_to = auth.uid() or created_by = auth.uid())
  );

drop policy if exists "deals insert by authenticated" on public.deals;
drop policy if exists "deals update by owner or admin" on public.deals;
drop policy if exists "deals delete by owner or admin" on public.deals;
drop policy if exists "deals insert scoped" on public.deals;
drop policy if exists "deals update by owner or admin scoped" on public.deals;
drop policy if exists "deals delete by owner or admin scoped" on public.deals;
create policy "deals insert scoped"
  on public.deals for insert
  with check (public.is_super_admin() or organization_id = public.current_org_id());
create policy "deals update by owner or admin scoped"
  on public.deals for update
  using (
    (public.is_super_admin() or organization_id = public.current_org_id())
    and (public.is_admin_or_above() or owner_id = auth.uid())
  );
create policy "deals delete by owner or admin scoped"
  on public.deals for delete
  using (
    (public.is_super_admin() or organization_id = public.current_org_id())
    and (public.is_admin_or_above() or owner_id = auth.uid())
  );

-- Settings-type tables: write policies now also require organization scoping.
do $$
declare
  t text;
begin
  foreach t in array array['pipeline_stages', 'industries', 'templates', 'deal_stages', 'win_loss_reasons', 'app_settings']
  loop
    execute format('drop policy if exists "%s insert admin" on public.%I', t, t);
    execute format('drop policy if exists "%s update admin" on public.%I', t, t);
    execute format('drop policy if exists "%s delete admin" on public.%I', t, t);
    execute format('drop policy if exists "%s insert admin scoped" on public.%I', t, t);
    execute format('drop policy if exists "%s update admin scoped" on public.%I', t, t);
    execute format('drop policy if exists "%s delete admin scoped" on public.%I', t, t);
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

-- organizations table: only the Super Admin can read/write it.
alter table public.organizations enable row level security;
drop policy if exists "organizations super admin only" on public.organizations;
create policy "organizations super admin only"
  on public.organizations for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
