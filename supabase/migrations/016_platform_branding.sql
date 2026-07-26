-- ============================================================================
-- Platform Default Branding (Super Admin)
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Single platform-wide row (not per-organization) — application code always
-- reads/creates the first row, mirroring app_settings' lazy-create pattern.
create table if not exists public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  platform_logo_storage_path text,
  platform_accent_color text,
  platform_name text,
  created_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

create policy "platform_settings super admin only"
  on public.platform_settings for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Logos are stored in the existing 'org-logos' bucket (public-read,
-- service-role-write) under a `platform/` path prefix — no new bucket needed.
