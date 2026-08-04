-- ============================================================================
-- Team Activity Feed — aggregates the existing lead_activities table
-- organization-wide instead of per-lead. The only existing index is
-- (lead_id, created_at desc), which doesn't help a reverse-chronological
-- scan across every lead in an organization; this adds a plain created_at
-- index so `order by created_at desc` + `lead_id in (...)` filtering (the
-- visible-lead-ids set, resolved via the existing leads-table visibility
-- scoping) stays fast as the table grows.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create index if not exists lead_activities_created_at_idx on public.lead_activities (created_at desc);
