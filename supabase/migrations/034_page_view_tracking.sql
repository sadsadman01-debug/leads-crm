-- ============================================================================
-- Page-view tracking for Request Access / Become an Affiliate
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  page_type text not null check (page_type in ('request_access', 'become_affiliate')),
  viewed_at timestamptz not null default now(),
  -- Hashed/anonymized — never the raw IP — same convention as referral_clicks.ip_hash.
  ip_hash text,
  -- Set only for request_access views loaded with a valid ?ref= — complementary
  -- to, not a replacement for, the per-affiliate referral_clicks table.
  referral_code text
);

create index if not exists page_views_page_type_viewed_at_idx on public.page_views (page_type, viewed_at desc);
-- Used only server-side to throttle repeat inserts from the same IP — not
-- displayed anywhere, mirrors support_contacts_source_ip_idx.
create index if not exists page_views_ip_hash_idx on public.page_views (page_type, ip_hash, viewed_at desc);

-- Platform-level oversight data — Super Admin only, same convention as every
-- other ops/audit table (audit_log, support_contacts, referral_clicks). All
-- writes happen server-side via the Service Role key (bypassing RLS).
alter table public.page_views enable row level security;
drop policy if exists "page_views super admin only" on public.page_views;
create policy "page_views super admin only" on public.page_views for select using (public.is_super_admin());
