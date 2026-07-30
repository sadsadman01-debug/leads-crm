-- ============================================================================
-- OSM-Based Lead Generation (search + website email enrichment + dedup)
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Cross-organization cache: a business's own public website either has a
-- discoverable email or it doesn't, regardless of which organization's
-- search happens to encounter it — so this is keyed by domain, not scoped to
-- an organization, and shared across every search to avoid re-fetching the
-- same websites repeatedly. `email` stays null when a full enrichment attempt
-- found nothing, which is itself a cacheable (and equally expensive-to-redo) result.
create table if not exists public.lead_gen_email_cache (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  email text,
  checked_at timestamptz not null default now()
);
create index if not exists lead_gen_email_cache_checked_at_idx on public.lead_gen_email_cache (checked_at);

alter table public.lead_gen_email_cache enable row level security;
drop policy if exists "lead_gen_email_cache super admin only" on public.lead_gen_email_cache;
create policy "lead_gen_email_cache super admin only" on public.lead_gen_email_cache for select using (public.is_super_admin());

-- Distinguishes leads imported from this feature from the existing 'Google
-- Maps' source (which predates this feature and is unrelated to it).
alter table public.leads drop constraint if exists leads_lead_source_check;
alter table public.leads add constraint leads_lead_source_check check (lead_source in ('Google Maps', 'Referral', 'Manual Entry', 'Website', 'Other', 'Lead Generation'));
