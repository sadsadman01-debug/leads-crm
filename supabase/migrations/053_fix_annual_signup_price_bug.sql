-- ============================================================================
-- Bug fix: signup_requests/organizations rows for Annual billing had
-- original_price_bdt/final_price_bdt computed from the MONTHLY rate
-- regardless of billing_cycle (createSignupRequest always set
-- original_price_bdt = monthly_price_usd, unconditionally). This made the
-- Payment Instructions page display the monthly amount with a "/year" label
-- attached for Annual signups. annual_total_usd itself was always computed
-- correctly and billing_history's actually-recorded first-payment amount
-- already special-cased annual correctly at approval time — only these two
-- duplicate/display fields on already-existing rows need correcting.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

update public.signup_requests
set original_price_bdt = annual_total_usd,
    discount_amount_bdt = 0,
    final_price_bdt = annual_total_usd
where billing_cycle = 'annual' and annual_total_usd is not null;

update public.organizations
set original_price_bdt = annual_total_usd,
    discount_amount_bdt = 0,
    final_price_bdt = annual_total_usd
where billing_cycle = 'annual' and annual_total_usd is not null;
