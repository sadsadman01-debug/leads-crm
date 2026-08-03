-- ============================================================================
-- Two-stage Signup Request lifecycle: awaiting_payment -> pending
-- A request now starts as "awaiting_payment" the instant the Request Access
-- form is submitted (so pricing/promo/payment_token can be computed exactly
-- as before), and only becomes "pending" — visible in the Super Admin's
-- Pending tab, counted as a genuine "Application Submitted" — once the
-- applicant confirms a payment method on the public /pay page.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.signup_requests drop constraint if exists signup_requests_status_check;
alter table public.signup_requests add constraint signup_requests_status_check
  check (status in ('awaiting_payment', 'pending', 'approved', 'rejected'));

alter table public.signup_requests alter column status set default 'awaiting_payment';
