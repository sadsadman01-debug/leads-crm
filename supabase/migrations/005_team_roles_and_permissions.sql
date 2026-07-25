-- ============================================================================
-- Phase 7: Multi-user team roles & permissions
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: extend to a 3-tier role system + team management fields
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists nickname text;
alter table public.profiles add column if not exists is_active boolean not null default true;

-- Drop the old 2-value constraint BEFORE migrating data — otherwise setting
-- role = 'super_admin' violates it (it only allowed 'admin'/'member' so far).
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'super_admin' where role = 'admin';
update public.profiles set role = 'user' where role = 'member';

alter table public.profiles add constraint profiles_role_check check (role in ('super_admin', 'admin', 'user'));
alter table public.profiles alter column role set default 'user';

-- New accounts (created via the Team Management "add member" function) default
-- to 'user'; the function immediately updates role/nickname right after creation.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- leads.assigned_to: the current owner shown in UI/filters. Distinct from
-- created_by (who made the record, kept for historical attribution).
-- ----------------------------------------------------------------------------
alter table public.leads add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
update public.leads set assigned_to = created_by where assigned_to is null;
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
create index if not exists deals_owner_id_idx on public.deals (owner_id);

-- ----------------------------------------------------------------------------
-- Role-check helper functions, used by RLS policies below.
-- ----------------------------------------------------------------------------
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

-- ============================================================================
-- RLS policy updates
-- The Netlify Functions API (service-role key, bypasses RLS) remains the real
-- enforcement path — every sensitive function independently re-checks the
-- caller's role/ownership server-side. These policies are the database-level
-- backstop the spec calls for, and would enforce the same rules if the
-- authenticated-role key were ever used directly against Postgres.
-- ============================================================================

-- profiles: every authenticated team member can read the full roster
-- (needed to show nicknames/roles/avatars on leads, deals, and the timeline).
drop policy if exists "authenticated users can read their own profile" on public.profiles;
drop policy if exists "authenticated users can read profiles" on public.profiles;
create policy "authenticated users can read profiles"
  on public.profiles for select using (auth.role() = 'authenticated');

-- leads: everyone can read; only admins/super admins or the assigned
-- owner/creator can write.
drop policy if exists "leads insert by authenticated" on public.leads;
drop policy if exists "leads update by owner or admin" on public.leads;
drop policy if exists "leads delete by owner or admin" on public.leads;

create policy "leads insert by authenticated"
  on public.leads for insert with check (auth.role() = 'authenticated');
create policy "leads update by owner or admin"
  on public.leads for update
  using (public.is_admin_or_above() or assigned_to = auth.uid() or created_by = auth.uid());
create policy "leads delete by owner or admin"
  on public.leads for delete
  using (public.is_admin_or_above() or assigned_to = auth.uid() or created_by = auth.uid());

-- deals: everyone can read; only admins/super admins or the deal owner can write.
drop policy if exists "deals insert by authenticated" on public.deals;
drop policy if exists "deals update by owner or admin" on public.deals;
drop policy if exists "deals delete by owner or admin" on public.deals;

create policy "deals insert by authenticated"
  on public.deals for insert with check (auth.role() = 'authenticated');
create policy "deals update by owner or admin"
  on public.deals for update
  using (public.is_admin_or_above() or owner_id = auth.uid());
create policy "deals delete by owner or admin"
  on public.deals for delete
  using (public.is_admin_or_above() or owner_id = auth.uid());

-- Settings-type tables: readable by everyone, writable only by admins/super admins.
do $$
declare
  t text;
begin
  foreach t in array array['pipeline_stages', 'industries', 'templates', 'deal_stages', 'win_loss_reasons', 'app_settings']
  loop
    execute format('drop policy if exists "%s insert admin" on public.%I', t, t);
    execute format('drop policy if exists "%s update admin" on public.%I', t, t);
    execute format('drop policy if exists "%s delete admin" on public.%I', t, t);
    execute format(
      'create policy "%s insert admin" on public.%I for insert with check (public.is_admin_or_above())', t, t
    );
    execute format(
      'create policy "%s update admin" on public.%I for update using (public.is_admin_or_above())', t, t
    );
    execute format(
      'create policy "%s delete admin" on public.%I for delete using (public.is_admin_or_above())', t, t
    );
  end loop;
end $$;
