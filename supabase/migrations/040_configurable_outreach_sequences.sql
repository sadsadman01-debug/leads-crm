-- ============================================================================
-- Configurable Per-Organization Outreach Sequences
-- Replaces the fixed 4-stage-per-channel outreach columns on lead_status with
-- an Admin-configurable sequence (arbitrary stage count, labels, intervals,
-- default templates) per Organization per channel. Zero data loss: every
-- existing lead's historical completion timestamps are migrated into the new
-- lead_outreach_progress table against seeded default-sequence stages before
-- the old columns are dropped.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.outreach_sequence_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin')),
  stage_number int not null check (stage_number >= 0),
  stage_label text not null,
  interval_days int check (interval_days > 0),
  default_template_id uuid references public.templates(id) on delete set null,
  display_order int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists outreach_stage_org_unique on public.outreach_sequence_stages (organization_id, channel, stage_number) where organization_id is not null;
create unique index if not exists outreach_stage_personal_unique on public.outreach_sequence_stages (channel, stage_number) where organization_id is null;

create table if not exists public.lead_outreach_progress (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  outreach_sequence_stage_id uuid not null references public.outreach_sequence_stages(id) on delete restrict,
  completed_at timestamptz,
  due_date timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, outreach_sequence_stage_id)
);

create index if not exists lead_outreach_progress_lead_idx on public.lead_outreach_progress (lead_id);
create index if not exists lead_outreach_progress_stage_idx on public.lead_outreach_progress (outreach_sequence_stage_id);

alter table public.outreach_sequence_stages enable row level security;
alter table public.lead_outreach_progress enable row level security;

-- Reads are org-scoped (+ Super Admin sees all); all writes happen server-side
-- via the Service Role key, same as pipeline_stages/deal_stages.
drop policy if exists "outreach_sequence_stages select scoped" on public.outreach_sequence_stages;
create policy "outreach_sequence_stages select scoped" on public.outreach_sequence_stages
  for select using (public.is_super_admin() or organization_id = public.current_org_id());

drop policy if exists "lead_outreach_progress select scoped" on public.lead_outreach_progress;
create policy "lead_outreach_progress select scoped" on public.lead_outreach_progress
  for select using (
    public.is_super_admin()
    or exists (
      select 1 from public.leads l
      where l.id = lead_outreach_progress.lead_id
        and l.organization_id = public.current_org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Seed each existing Organization's (+ the null-organization personal scope's)
-- default 4-stage sequence per channel, carrying over that org's currently
-- configured intervals from app_settings (migration 039) as the starting
-- per-stage interval_days.
-- ---------------------------------------------------------------------------
do $$
declare
  org record;
  settings record;
begin
  for org in
    select id from public.organizations
    union all
    select null::uuid
  loop
    select * into settings from public.app_settings s
      where (org.id is null and s.organization_id is null) or s.organization_id = org.id
      limit 1;
    if settings.id is null then
      continue;
    end if;

    insert into public.outreach_sequence_stages (organization_id, channel, stage_number, stage_label, interval_days, display_order)
    values
      (org.id, 'email', 0, 'Cold Email', null, 0),
      (org.id, 'email', 1, 'Follow-up 1', settings.email_followup1_interval_days, 1),
      (org.id, 'email', 2, 'Follow-up 2', settings.email_followup2_interval_days, 2),
      (org.id, 'email', 3, 'Follow-up 3', settings.email_followup3_interval_days, 3),
      (org.id, 'whatsapp', 0, 'WhatsApp Message', null, 0),
      (org.id, 'whatsapp', 1, 'Follow-up 1', settings.whatsapp_followup1_interval_days, 1),
      (org.id, 'whatsapp', 2, 'Follow-up 2', settings.whatsapp_followup2_interval_days, 2),
      (org.id, 'whatsapp', 3, 'Follow-up 3', settings.whatsapp_followup3_interval_days, 3),
      (org.id, 'linkedin', 0, 'LinkedIn Message', null, 0),
      (org.id, 'linkedin', 1, 'Follow-up 1', settings.linkedin_followup1_interval_days, 1),
      (org.id, 'linkedin', 2, 'Follow-up 2', settings.linkedin_followup2_interval_days, 2),
      (org.id, 'linkedin', 3, 'Follow-up 3', settings.linkedin_followup3_interval_days, 3)
    on conflict do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Migrate every lead's historical fixed-column completion data into
-- lead_outreach_progress rows against the stages just seeded for its own
-- organization, preserving original timestamps exactly.
-- ---------------------------------------------------------------------------
do $$
declare
  ls record;
  stage_id uuid;
  org_filter uuid;
begin
  for ls in select s.*, l.organization_id as lead_org_id from public.lead_status s join public.leads l on l.id = s.lead_id
  loop
    org_filter := ls.lead_org_id;

    if ls.cold_email_sent then
      select id into stage_id from public.outreach_sequence_stages where channel = 'email' and stage_number = 0 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at) values (ls.lead_id, stage_id, ls.cold_email_sent_at) on conflict do nothing;
      end if;
    end if;
    if ls.followup1_sent or ls.followup1_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'email' and stage_number = 1 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.followup1_sent_at, ls.followup1_due_at) on conflict do nothing;
      end if;
    end if;
    if ls.followup2_sent or ls.followup2_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'email' and stage_number = 2 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.followup2_sent_at, ls.followup2_due_at) on conflict do nothing;
      end if;
    end if;
    if ls.followup3_sent or ls.followup3_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'email' and stage_number = 3 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.followup3_sent_at, ls.followup3_due_at) on conflict do nothing;
      end if;
    end if;

    if ls.whatsapp_sent then
      select id into stage_id from public.outreach_sequence_stages where channel = 'whatsapp' and stage_number = 0 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at) values (ls.lead_id, stage_id, ls.whatsapp_sent_at) on conflict do nothing;
      end if;
    end if;
    if ls.whatsapp_followup1_sent or ls.whatsapp_followup1_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'whatsapp' and stage_number = 1 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.whatsapp_followup1_sent_at, ls.whatsapp_followup1_due_at) on conflict do nothing;
      end if;
    end if;
    if ls.whatsapp_followup2_sent or ls.whatsapp_followup2_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'whatsapp' and stage_number = 2 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.whatsapp_followup2_sent_at, ls.whatsapp_followup2_due_at) on conflict do nothing;
      end if;
    end if;
    if ls.whatsapp_followup3_sent or ls.whatsapp_followup3_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'whatsapp' and stage_number = 3 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.whatsapp_followup3_sent_at, ls.whatsapp_followup3_due_at) on conflict do nothing;
      end if;
    end if;

    if ls.linkedin_sent then
      select id into stage_id from public.outreach_sequence_stages where channel = 'linkedin' and stage_number = 0 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at) values (ls.lead_id, stage_id, ls.linkedin_sent_at) on conflict do nothing;
      end if;
    end if;
    if ls.linkedin_followup1_sent or ls.linkedin_followup1_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'linkedin' and stage_number = 1 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.linkedin_followup1_sent_at, ls.linkedin_followup1_due_at) on conflict do nothing;
      end if;
    end if;
    if ls.linkedin_followup2_sent or ls.linkedin_followup2_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'linkedin' and stage_number = 2 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.linkedin_followup2_sent_at, ls.linkedin_followup2_due_at) on conflict do nothing;
      end if;
    end if;
    if ls.linkedin_followup3_sent or ls.linkedin_followup3_due_at is not null then
      select id into stage_id from public.outreach_sequence_stages where channel = 'linkedin' and stage_number = 3 and (organization_id = org_filter or (organization_id is null and org_filter is null));
      if stage_id is not null then
        insert into public.lead_outreach_progress (lead_id, outreach_sequence_stage_id, completed_at, due_date) values (ls.lead_id, stage_id, ls.linkedin_followup3_sent_at, ls.linkedin_followup3_due_at) on conflict do nothing;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Drop the now-superseded fixed columns. Activity Timeline entries
-- (lead_activities) are untouched — they're independent text log rows, never
-- foreign-keyed to these columns, so no history is lost by this drop.
-- ---------------------------------------------------------------------------
alter table public.lead_status
  drop column if exists cold_email_sent,
  drop column if exists cold_email_sent_at,
  drop column if exists followup1_sent,
  drop column if exists followup1_sent_at,
  drop column if exists followup1_due_at,
  drop column if exists followup2_sent,
  drop column if exists followup2_sent_at,
  drop column if exists followup2_due_at,
  drop column if exists followup3_sent,
  drop column if exists followup3_sent_at,
  drop column if exists followup3_due_at,
  drop column if exists whatsapp_sent,
  drop column if exists whatsapp_sent_at,
  drop column if exists whatsapp_followup1_sent,
  drop column if exists whatsapp_followup1_sent_at,
  drop column if exists whatsapp_followup1_due_at,
  drop column if exists whatsapp_followup2_sent,
  drop column if exists whatsapp_followup2_sent_at,
  drop column if exists whatsapp_followup2_due_at,
  drop column if exists whatsapp_followup3_sent,
  drop column if exists whatsapp_followup3_sent_at,
  drop column if exists whatsapp_followup3_due_at,
  drop column if exists linkedin_sent,
  drop column if exists linkedin_sent_at,
  drop column if exists linkedin_followup1_sent,
  drop column if exists linkedin_followup1_sent_at,
  drop column if exists linkedin_followup1_due_at,
  drop column if exists linkedin_followup2_sent,
  drop column if exists linkedin_followup2_sent_at,
  drop column if exists linkedin_followup2_due_at,
  drop column if exists linkedin_followup3_sent,
  drop column if exists linkedin_followup3_sent_at,
  drop column if exists linkedin_followup3_due_at;

alter table public.app_settings
  drop column if exists email_followup1_interval_days,
  drop column if exists email_followup2_interval_days,
  drop column if exists email_followup3_interval_days,
  drop column if exists whatsapp_followup1_interval_days,
  drop column if exists whatsapp_followup2_interval_days,
  drop column if exists whatsapp_followup3_interval_days,
  drop column if exists linkedin_followup1_interval_days,
  drop column if exists linkedin_followup2_interval_days,
  drop column if exists linkedin_followup3_interval_days;
