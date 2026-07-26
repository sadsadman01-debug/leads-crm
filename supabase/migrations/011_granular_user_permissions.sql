-- ============================================================================
-- Phase 13: Granular, per-user configurable permissions for User-role accounts
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Reads the caller's permissions jsonb (empty object for admins/super admins —
-- they never consult it, since is_admin_or_above() always short-circuits first).
create or replace function public.my_permissions()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(permissions, '{}'::jsonb) from public.profiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- leads: select now respects leadVisibility ('all' default vs 'own'); update/
-- delete now respect canEditAny (only meaningful when visibility='all') and
-- canDelete, on top of the existing owner/admin checks.
-- ----------------------------------------------------------------------------
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

drop policy if exists "leads update by owner or admin scoped" on public.leads;
create policy "leads update by owner or admin scoped"
  on public.leads for update
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

drop policy if exists "leads delete by owner or admin scoped" on public.leads;
create policy "leads delete by owner or admin scoped"
  on public.leads for delete
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

-- ----------------------------------------------------------------------------
-- deals: same pattern, keyed on dealVisibility/owner_id (deals have no
-- separate created_by column — owner_id is the sole ownership field).
-- ----------------------------------------------------------------------------
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

drop policy if exists "deals update by owner or admin scoped" on public.deals;
create policy "deals update by owner or admin scoped"
  on public.deals for update
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

drop policy if exists "deals delete by owner or admin scoped" on public.deals;
create policy "deals delete by owner or admin scoped"
  on public.deals for delete
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

-- ----------------------------------------------------------------------------
-- Settings-type tables: write policies now also allow a User with the matching
-- delegated feature permission, in addition to the existing admin-or-above check.
-- ----------------------------------------------------------------------------
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
    execute format('drop policy if exists "%s insert admin scoped" on public.%I', cfg.table_name, cfg.table_name);
    execute format('drop policy if exists "%s update admin scoped" on public.%I', cfg.table_name, cfg.table_name);
    execute format('drop policy if exists "%s delete admin scoped" on public.%I', cfg.table_name, cfg.table_name);

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

-- ----------------------------------------------------------------------------
-- saved_reports: a User granted canAccessReportBuilder may now create reports,
-- and may update/delete reports they themselves created (never someone else's).
-- ----------------------------------------------------------------------------
drop policy if exists "saved_reports insert admin scoped" on public.saved_reports;
create policy "saved_reports insert admin scoped" on public.saved_reports for insert
  with check (
    public.is_super_admin()
    or (public.is_admin_or_above() and organization_id = public.current_org_id())
    or (organization_id = public.current_org_id() and coalesce((public.my_permissions()->>'canAccessReportBuilder')::boolean, false))
  );

drop policy if exists "saved_reports update admin scoped" on public.saved_reports;
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

drop policy if exists "saved_reports delete admin scoped" on public.saved_reports;
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
