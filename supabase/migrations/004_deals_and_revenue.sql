-- ============================================================================
-- Leads CRM — Part 6: Deals / Opportunities, deal pipeline, revenue forecasting
-- Run this once in the Supabase SQL editor against a project that already has
-- schema.sql + migrations 002/003 applied. Also folded into schema.sql for
-- fresh installs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- deal_stages: separate, admin-configurable pipeline from lead pipeline_stages.
-- is_closed/is_won are booleans (not name-matching) so renaming a stage never
-- breaks "is this deal closed" logic.
-- ----------------------------------------------------------------------------
create table if not exists public.deal_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null,
  default_probability int not null default 0 check (default_probability between 0 and 100),
  is_closed boolean not null default false,
  is_won boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists deal_stages_position_idx on public.deal_stages (position);

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
-- win_loss_reasons: admin-editable suggestion list. Deals store outcome_reason
-- as free text (so "Other: <custom text>" always works) rather than an FK.
-- ----------------------------------------------------------------------------
create table if not exists public.win_loss_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_lead_id_idx on public.deals (lead_id);
create index if not exists deals_stage_id_idx on public.deals (stage_id);
create index if not exists deals_expected_close_date_idx on public.deals (expected_close_date);

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

-- ----------------------------------------------------------------------------
-- app_settings: add a default currency for new deals.
-- ----------------------------------------------------------------------------
alter table public.app_settings add column if not exists default_currency text not null default 'USD';

-- ----------------------------------------------------------------------------
-- RLS — same read-only-for-authenticated pattern as every other table.
-- ----------------------------------------------------------------------------
alter table public.deal_stages enable row level security;
alter table public.win_loss_reasons enable row level security;
alter table public.deals enable row level security;

drop policy if exists "authenticated users can read deal_stages" on public.deal_stages;
create policy "authenticated users can read deal_stages"
  on public.deal_stages for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can read win_loss_reasons" on public.win_loss_reasons;
create policy "authenticated users can read win_loss_reasons"
  on public.win_loss_reasons for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can read deals" on public.deals;
create policy "authenticated users can read deals"
  on public.deals for select using (auth.role() = 'authenticated');
