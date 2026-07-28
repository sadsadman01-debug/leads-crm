-- ============================================================================
-- Full Data Export/Backup
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.export_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  triggered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists export_log_org_idx on public.export_log (organization_id, created_at desc);

alter table public.export_log enable row level security;

-- Same shape as the other org-scoped audit-style tables: an Admin sees only
-- their own organization's exports; the Super Admin sees everything.
drop policy if exists "export_log select scoped" on public.export_log;
create policy "export_log select scoped"
  on public.export_log for select
  using (
    public.is_super_admin()
    or (public.is_admin_or_above() and organization_id = public.current_org_id())
  );
