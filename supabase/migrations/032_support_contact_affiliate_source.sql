-- ============================================================================
-- Support Contacts: distinguish Affiliate Dashboard submissions
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.support_contacts drop constraint if exists support_contacts_source_check;
alter table public.support_contacts add constraint support_contacts_source_check check (source in ('in_app', 'pre_auth', 'affiliate'));
