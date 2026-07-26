-- ============================================================================
-- Phase 12: Contact Person Name on Leads + Template Type categorization
-- Run this in the Supabase SQL editor on an existing project (idempotent).
-- ============================================================================

alter table public.leads add column if not exists contact_name text;

alter table public.templates add column if not exists template_type text not null default 'cold_email'
  check (template_type in ('cold_email', 'followup1', 'followup2', 'followup3', 'whatsapp', 'linkedin', 'sms'));

create index if not exists templates_template_type_idx on public.templates (template_type);
