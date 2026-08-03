-- ============================================================================
-- Public Payment Form/Link — non-guessable payment token
-- The /pay page's ?request= parameter previously used signup_requests.id
-- directly (a sequential-enough-to-fingerprint, definitely-enumerable-in-
-- principle primary key also referenced internally everywhere else). This
-- adds a dedicated, high-entropy token used ONLY for the public payment link,
-- so leaking/guessing it can never expose or let anyone tamper with another
-- applicant's payment flow, and it stays decoupled from the internal id.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.signup_requests
  add column if not exists payment_token text unique default encode(gen_random_bytes(24), 'hex');

-- Backfill any rows inserted before the column default existed (none should
-- exist without one going forward, since every insert now gets it for free).
update public.signup_requests set payment_token = encode(gen_random_bytes(24), 'hex') where payment_token is null;

alter table public.signup_requests alter column payment_token set not null;

create unique index if not exists signup_requests_payment_token_idx on public.signup_requests (payment_token);
