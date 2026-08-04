-- ============================================================================
-- Centralizes the "days before expiry" warning threshold — previously the
-- Billing dashboard's "Due Soon" status hardcoded its own local constant
-- (DUE_SOON_DAYS = 5 in netlify/functions/routes/billing.ts) with no
-- Organization-facing equivalent. Both the Organization's own Dashboard
-- warning banner and the Super Admin's Billing "Due Soon" status now read
-- this single configured value instead.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.platform_settings add column if not exists subscription_warning_days integer not null default 5;
