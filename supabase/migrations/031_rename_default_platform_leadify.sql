-- ============================================================================
-- Platform rebrand: "Leads CRM" -> "Leadify"
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Only touches rows still on the old default (or never customized) — a
-- Super Admin who has deliberately set their own Platform Name is left
-- untouched, exactly as the fallback chain already respects.
update public.platform_settings
set platform_name = 'Leadify'
where platform_name is null or platform_name = 'Leads CRM';
