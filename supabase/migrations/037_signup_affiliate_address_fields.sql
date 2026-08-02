-- ============================================================================
-- Mandatory Address Fields (City/Country/ZIP) for Signup Requests and
-- Affiliate Applications, carried through to Organizations and Affiliates.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Nullable at the DB level (existing rows predate these fields) — required-ness
-- for new submissions is enforced at the application layer (client + server),
-- the same approach already used for other request-form fields in this app.
alter table public.signup_requests add column if not exists city text;
alter table public.signup_requests add column if not exists country text;
alter table public.signup_requests add column if not exists zip_code text;

alter table public.organizations add column if not exists city text;
alter table public.organizations add column if not exists country text;
alter table public.organizations add column if not exists zip_code text;

alter table public.affiliate_applications add column if not exists city text;
alter table public.affiliate_applications add column if not exists country text;
alter table public.affiliate_applications add column if not exists zip_code text;

alter table public.affiliates add column if not exists city text;
alter table public.affiliates add column if not exists country text;
alter table public.affiliates add column if not exists zip_code text;
