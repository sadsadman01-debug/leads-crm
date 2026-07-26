-- ============================================================================
-- Organization Branding / White-label
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.organizations
  add column if not exists logo_storage_path text,
  add column if not exists accent_color text,
  add column if not exists display_name text;

-- Private-write, public-read bucket for org logos — logos aren't sensitive,
-- so (unlike lead-attachments) they're served directly via public URL rather
-- than per-request signed URLs, avoiding refresh churn in the sidebar/header.
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

create policy "service role manages org-logos"
  on storage.objects for all
  using (bucket_id = 'org-logos' and auth.role() = 'service_role');
