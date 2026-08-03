-- ============================================================================
-- Promo Code fixes/enhancements: Early Bird exclusion + optional usage limits
-- (1) Promo codes must not apply while Early Bird pricing is active — enforced
--     entirely in application code (netlify/functions/lib/promoCodes.ts), no
--     schema change needed for that part.
-- (2) Adds two independently-optional limit fields: max_uses (usage count cap)
--     and expires_at (date cap). Both null = unlimited/no-expiry, unchanged
--     from how every existing promo code already behaves.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.promo_codes add column if not exists max_uses integer check (max_uses > 0);
alter table public.promo_codes add column if not exists expires_at timestamptz;
