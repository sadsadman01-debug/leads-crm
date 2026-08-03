-- ============================================================================
-- Regression fix: lead_activities RLS was never actually org-scoped
-- Migration 003 created it with a bare `using (auth.role() = 'authenticated')`
-- select policy, and the 006 org-scoping fix-up loop that corrected every
-- other early table's policy omitted lead_activities (it's a lead-joined
-- sub-table with no organization_id of its own, so the generic per-column
-- loop couldn't handle it the same way). supabase/schema.sql's consolidated
-- snapshot already has the correct scoped version, but no real migration
-- file ever created it — this closes that gap, matching the exact pattern
-- already used for lead_tags/lead_attachments/lead_status/lead_social_profiles.
-- All actual application reads still go through the Service Role client
-- (this is defense-in-depth), but this closes a real cross-tenant read path
-- for any direct anon/authenticated-key query.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

drop policy if exists "authenticated users can read lead_activities" on public.lead_activities;
create policy "authenticated users can read lead_activities"
  on public.lead_activities for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and (public.is_super_admin() or l.organization_id = public.current_org_id())
  ));
