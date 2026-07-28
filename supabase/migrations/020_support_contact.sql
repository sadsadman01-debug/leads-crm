-- ============================================================================
-- In-App Help/Support Widget
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Super Admin's own WhatsApp/email contact info, shown to Admin/User accounts
-- via the floating Help widget. Lives on the same single platform-wide row as
-- Platform Branding — independent fields, untouched by branding's own reset.
alter table public.platform_settings
  add column if not exists support_whatsapp text,
  add column if not exists support_email text;

-- Lightweight log of Help-widget clicks, for the Super Admin's own visibility
-- only — not a ticketing/reply system, the actual conversation happens outside
-- the app in WhatsApp/email.
create table if not exists public.support_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'email')),
  message_preview text,
  created_at timestamptz not null default now()
);

create index if not exists support_contacts_created_at_idx on public.support_contacts (created_at desc);
create index if not exists support_contacts_org_idx on public.support_contacts (organization_id);

alter table public.support_contacts enable row level security;
create policy "support_contacts super admin only"
  on public.support_contacts for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
