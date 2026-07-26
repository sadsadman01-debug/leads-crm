-- ============================================================================
-- Global Search — trigram indexes for fast ILIKE '%term%' substring matching
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create extension if not exists pg_trgm;

create index if not exists leads_company_name_trgm_idx on public.leads using gin (company_name gin_trgm_ops);
create index if not exists leads_contact_name_trgm_idx on public.leads using gin (contact_name gin_trgm_ops);
create index if not exists leads_email_trgm_idx on public.leads using gin (email gin_trgm_ops);
create index if not exists leads_phone_trgm_idx on public.leads using gin (phone gin_trgm_ops);
create index if not exists leads_address_trgm_idx on public.leads using gin (address gin_trgm_ops);

create index if not exists deals_name_trgm_idx on public.deals using gin (name gin_trgm_ops);

create index if not exists profiles_nickname_trgm_idx on public.profiles using gin (nickname gin_trgm_ops);
create index if not exists profiles_email_trgm_idx on public.profiles using gin (email gin_trgm_ops);
