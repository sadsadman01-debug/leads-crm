-- ============================================================================
-- Convert the platform's own subscription pricing / affiliate commission
-- amounts from USD to BDT. Column names keep their existing "_usd" suffix
-- (no schema rename) — they now simply store BDT-denominated values.
-- Does NOT touch the separate Deals/Revenue multi-currency feature.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Early Bird ৳499/month, Standard ৳999/month — both the live configured
-- values (for the single existing platform_settings row) and the column
-- defaults (so a freshly-created row, or any future re-seed, also starts BDT).
alter table public.platform_settings alter column early_bird_price_usd set default 499;
alter table public.platform_settings alter column standard_price_usd set default 999;
update public.platform_settings set early_bird_price_usd = 499, standard_price_usd = 999;

-- Minimum withdrawal: a round, sensible BDT figure — not a precise USD
-- conversion — replacing whatever USD-era value (if any) was configured.
update public.platform_settings set affiliate_min_withdrawal_usd = 1000 where affiliate_min_withdrawal_usd is not null;

-- Admin-editable free text fields (Payment Instructions, Promotional Banner
-- Benefits, Affiliate Program Terms) may still mention "$"/"USD" from before
-- this conversion — swap to the BDT equivalents, leaving everything else
-- in the text untouched.
update public.platform_settings set payment_instructions = regexp_replace(replace(payment_instructions, '$', '৳'), 'USD', 'BDT', 'gi')
  where payment_instructions is not null;
update public.platform_settings set promotional_banner_text = regexp_replace(replace(promotional_banner_text, '$', '৳'), 'USD', 'BDT', 'gi')
  where promotional_banner_text is not null;
update public.platform_settings set affiliate_program_terms = regexp_replace(replace(affiliate_program_terms, '$', '৳'), 'USD', 'BDT', 'gi')
  where affiliate_program_terms is not null;
