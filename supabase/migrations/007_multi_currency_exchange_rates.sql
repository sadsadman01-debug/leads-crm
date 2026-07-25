-- ============================================================================
-- Phase 9: Multi-currency support with live exchange rates
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- exchange_rates: platform-wide (not organization-scoped) cache of the free
-- ExchangeRate-API open endpoint. Always exactly one row (id = 1), refreshed
-- by a Netlify Function whenever it's stale (>~20h old).
-- ----------------------------------------------------------------------------
create table if not exists public.exchange_rates (
  id smallint primary key default 1 check (id = 1),
  base_currency text not null default 'USD',
  rates jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.exchange_rates enable row level security;
drop policy if exists "authenticated users can read exchange_rates" on public.exchange_rates;
create policy "authenticated users can read exchange_rates"
  on public.exchange_rates for select using (auth.role() = 'authenticated');
-- No write policy: only the service-role key (inside the Netlify Function) ever writes this table.

-- ----------------------------------------------------------------------------
-- deals.closed_exchange_rate_snapshot: locked-in rates at the moment a deal
-- closed, so historical revenue reporting never silently shifts as live rates
-- fluctuate. Null for still-open deals and for deals closed before this phase.
-- ----------------------------------------------------------------------------
alter table public.deals add column if not exists closed_exchange_rate_snapshot jsonb;
