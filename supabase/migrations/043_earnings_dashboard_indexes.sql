-- ============================================================================
-- Earnings Dashboard (Super Admin only) — supporting indexes
-- billing_history already has an (organization_id, paid_at desc) index for
-- per-organization lookups; the Earnings dashboard instead scans/filters by
-- date range ACROSS every organization, which that composite index can't
-- serve efficiently, so a dedicated paid_at index is added here. Same reasoning
-- for affiliate_commissions' created_at (used to compute Net Earnings).
-- No new tables/columns — this is a read-only reporting feature entirely on
-- top of existing billing_history/affiliate_commissions/organizations data.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create index if not exists billing_history_paid_at_idx on public.billing_history (paid_at desc);
create index if not exists affiliate_commissions_created_at_idx on public.affiliate_commissions (created_at desc);
