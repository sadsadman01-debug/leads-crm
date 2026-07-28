-- ============================================================================
-- In-App Help/Support Widget — replace mailto: with an in-app form
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- The widget no longer opens the user's email client at all; it submits
-- directly into support_contacts, which the Super Admin reviews in-app.
-- ============================================================================

alter table public.support_contacts
  add column if not exists contact_email text;
