-- ============================================================================
-- Remove the OSM-Based Lead Generation feature (fully removed from the app)
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Reassign any leads sourced via this feature before narrowing the check
-- constraint below — 'Other' is the closest fit among the remaining options.
update public.leads set lead_source = 'Other' where lead_source = 'Lead Generation';

alter table public.leads drop constraint if exists leads_lead_source_check;
alter table public.leads add constraint leads_lead_source_check check (lead_source in ('Google Maps', 'Referral', 'Manual Entry', 'Website', 'Other'));

-- Exclusive to this feature (per-domain email-enrichment cache) — safe to drop entirely.
drop table if exists public.lead_gen_email_cache;
