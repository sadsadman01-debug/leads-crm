-- ============================================================================
-- In-App Help/Support Widget — simplified to email-only
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Support Email now defaults to navigantindex@gmail.com so the widget works
-- out of the box; backfill any existing row that was left blank.
alter table public.platform_settings
  alter column support_email set default 'navigantindex@gmail.com';

update public.platform_settings
set support_email = 'navigantindex@gmail.com'
where support_email is null;

-- WhatsApp is no longer part of this feature.
alter table public.platform_settings drop column if exists support_whatsapp;

-- The log no longer distinguishes channel — email is the only option now.
alter table public.support_contacts drop column if exists channel;
