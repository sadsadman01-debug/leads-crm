-- ============================================================================
-- Referral Leaderboard — ranks affiliates by converted-referral count.
-- Adds the two new per-affiliate preference fields the feature needs:
-- an optional public-facing display name (distinct from their real full_name,
-- for affiliates who'd prefer more anonymity toward OTHER affiliates), and an
-- opt-out toggle controlling whether they appear in the leaderboard's visible
-- top-N list to other affiliates (the Super Admin always sees everyone,
-- regardless of this flag — enforced in application code, not RLS, matching
-- this table's existing Super-Admin-only RLS policy).
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.affiliates add column if not exists public_display_name text;
alter table public.affiliates add column if not exists leaderboard_opt_in boolean not null default true;
