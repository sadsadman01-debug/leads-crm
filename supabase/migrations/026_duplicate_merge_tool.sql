-- ============================================================================
-- Duplicate Merge Tool (Leads & Deals)
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- "Not a duplicate" dismissals, so a dismissed pair stops surfacing in future
-- scans. Generic across record types (leads/deals) rather than two near-
-- identical tables. Order-independent uniqueness via least()/greatest() on
-- the pair — works on uuid since it supports standard comparison operators.
create table if not exists public.duplicate_dismissals (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('lead', 'deal')),
  organization_id uuid references public.organizations(id) on delete cascade,
  record_id_a uuid not null,
  record_id_b uuid not null,
  dismissed_by uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz not null default now()
);

create unique index if not exists duplicate_dismissals_pair_idx
  on public.duplicate_dismissals (record_type, least(record_id_a, record_id_b), greatest(record_id_a, record_id_b));

alter table public.duplicate_dismissals enable row level security;

drop policy if exists "duplicate_dismissals admin scoped" on public.duplicate_dismissals;
create policy "duplicate_dismissals admin scoped"
  on public.duplicate_dismissals for select
  using (
    public.is_super_admin()
    or (public.is_admin_or_above() and organization_id = public.current_org_id())
  );

-- Pre-merge snapshot of the "losing" record (plus bookkeeping of exactly
-- which child rows were reassigned) so a merge can be reversed — either via
-- the immediate "Undo" toast, or later from the Recently Merged recovery
-- screen within the retention window. Writes only ever happen server-side
-- via the Service Role key, same as every other audit-style table.
create table if not exists public.merge_snapshots (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('lead', 'deal')),
  organization_id uuid references public.organizations(id) on delete cascade,
  survivor_id uuid not null,
  loser_id uuid not null,
  -- Full pre-merge state of the record that was deleted (its own columns plus,
  -- for leads, its status/tags/social-profiles/attachments as they existed
  -- before the merge).
  loser_snapshot jsonb not null,
  -- Only the survivor's fields/status/custom-fields actually changed by the
  -- merge, keyed by column name, holding their PRE-merge values.
  survivor_backup jsonb not null default '{}'::jsonb,
  moved_activity_ids uuid[] not null default '{}',
  moved_deal_ids uuid[] not null default '{}',
  moved_attachment_ids uuid[] not null default '{}',
  moved_social_profile_ids uuid[] not null default '{}',
  added_tag_ids uuid[] not null default '{}',
  merge_note_activity_id uuid,
  merged_by uuid references public.profiles(id) on delete set null,
  merged_at timestamptz not null default now(),
  restored_at timestamptz
);

create index if not exists merge_snapshots_org_idx on public.merge_snapshots (organization_id, merged_at desc);

alter table public.merge_snapshots enable row level security;

drop policy if exists "merge_snapshots admin scoped" on public.merge_snapshots;
create policy "merge_snapshots admin scoped"
  on public.merge_snapshots for select
  using (
    public.is_super_admin()
    or (public.is_admin_or_above() and organization_id = public.current_org_id())
  );

-- Extend the Audit Log's event_type check constraint with the two new merge events.
alter table public.audit_log drop constraint if exists audit_log_event_type_check;
alter table public.audit_log add constraint audit_log_event_type_check check (event_type in (
  'login_success', 'login_failure', 'logout',
  'signup_request_submitted', 'signup_request_approved', 'signup_request_rejected',
  'admin_account_created', 'user_account_created',
  'team_member_deactivated', 'team_member_reactivated', 'team_member_deleted',
  'permissions_changed',
  'password_reset_request_submitted', 'password_reset_request_resolved',
  'mfa_reset_request_submitted', 'mfa_reset_request_resolved',
  'mfa_enabled', 'mfa_disabled',
  'organization_created', 'organization_suspended', 'organization_reactivated', 'organization_deleted',
  'organization_branding_changed', 'platform_branding_changed',
  'data_export_triggered', 'bulk_leads_deleted',
  'leads_merged', 'deals_merged'
));
