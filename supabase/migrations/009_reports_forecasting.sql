-- ============================================================================
-- Phase 11: Custom report builder, sales forecasting & quota tracking
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

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
-- RLS — same org-scoped pattern as other settings-type tables (Phase 8).
-- saved_reports read access additionally allows the report's own creator or
-- anyone when visible_to_all is set, on top of admin-or-above.
-- ----------------------------------------------------------------------------
alter table public.saved_reports enable row level security;
alter table public.quotas enable row level security;

drop policy if exists "saved_reports select scoped" on public.saved_reports;
create policy "saved_reports select scoped"
  on public.saved_reports for select
  using (
    public.is_super_admin()
    or (organization_id = public.current_org_id() and (visible_to_all or created_by = auth.uid() or public.is_admin_or_above()))
  );

drop policy if exists "saved_reports insert admin scoped" on public.saved_reports;
drop policy if exists "saved_reports update admin scoped" on public.saved_reports;
drop policy if exists "saved_reports delete admin scoped" on public.saved_reports;
create policy "saved_reports insert admin scoped"
  on public.saved_reports for insert
  with check (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));
create policy "saved_reports update admin scoped"
  on public.saved_reports for update
  using (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));
create policy "saved_reports delete admin scoped"
  on public.saved_reports for delete
  using (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));

drop policy if exists "quotas select scoped" on public.quotas;
create policy "quotas select scoped"
  on public.quotas for select
  using (public.is_super_admin() or organization_id = public.current_org_id());

drop policy if exists "quotas insert admin scoped" on public.quotas;
drop policy if exists "quotas update admin scoped" on public.quotas;
drop policy if exists "quotas delete admin scoped" on public.quotas;
create policy "quotas insert admin scoped"
  on public.quotas for insert
  with check (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));
create policy "quotas update admin scoped"
  on public.quotas for update
  using (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));
create policy "quotas delete admin scoped"
  on public.quotas for delete
  using (public.is_super_admin() or (public.is_admin_or_above() and organization_id = public.current_org_id()));
