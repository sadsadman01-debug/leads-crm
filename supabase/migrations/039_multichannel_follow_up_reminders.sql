-- ============================================================================
-- Multi-Channel, Per-Stage Follow-up Reminder System
-- Replaces the single follow_up_interval_days setting with 9 independently
-- configurable per-stage intervals (email/WhatsApp/LinkedIn × 3 stages each),
-- and extends the follow-up chain to WhatsApp and LinkedIn outreach.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- app_settings: 9 new interval columns, replacing follow_up_interval_days.
-- ---------------------------------------------------------------------------
alter table public.app_settings add column if not exists email_followup1_interval_days int not null default 3 check (email_followup1_interval_days > 0);
alter table public.app_settings add column if not exists email_followup2_interval_days int not null default 4 check (email_followup2_interval_days > 0);
alter table public.app_settings add column if not exists email_followup3_interval_days int not null default 7 check (email_followup3_interval_days > 0);
alter table public.app_settings add column if not exists whatsapp_followup1_interval_days int not null default 2 check (whatsapp_followup1_interval_days > 0);
alter table public.app_settings add column if not exists whatsapp_followup2_interval_days int not null default 3 check (whatsapp_followup2_interval_days > 0);
alter table public.app_settings add column if not exists whatsapp_followup3_interval_days int not null default 5 check (whatsapp_followup3_interval_days > 0);
alter table public.app_settings add column if not exists linkedin_followup1_interval_days int not null default 2 check (linkedin_followup1_interval_days > 0);
alter table public.app_settings add column if not exists linkedin_followup2_interval_days int not null default 3 check (linkedin_followup2_interval_days > 0);
alter table public.app_settings add column if not exists linkedin_followup3_interval_days int not null default 5 check (linkedin_followup3_interval_days > 0);

-- Existing organizations keep their current cadence immediately after this
-- migration — every stage/channel starts at whatever single value they'd
-- already configured, so nothing changes in practice until an Admin edits it.
update public.app_settings set
  email_followup1_interval_days = follow_up_interval_days,
  email_followup2_interval_days = follow_up_interval_days,
  email_followup3_interval_days = follow_up_interval_days,
  whatsapp_followup1_interval_days = follow_up_interval_days,
  whatsapp_followup2_interval_days = follow_up_interval_days,
  whatsapp_followup3_interval_days = follow_up_interval_days,
  linkedin_followup1_interval_days = follow_up_interval_days,
  linkedin_followup2_interval_days = follow_up_interval_days,
  linkedin_followup3_interval_days = follow_up_interval_days
where follow_up_interval_days is not null;

alter table public.app_settings drop column if exists follow_up_interval_days;

-- ---------------------------------------------------------------------------
-- lead_status: WhatsApp and LinkedIn follow-up 1/2/3 sent/timestamp/due-date
-- columns, mirroring the existing email followup1/2/3 columns exactly.
-- ---------------------------------------------------------------------------
alter table public.lead_status add column if not exists whatsapp_followup1_sent boolean not null default false;
alter table public.lead_status add column if not exists whatsapp_followup1_sent_at timestamptz;
alter table public.lead_status add column if not exists whatsapp_followup1_due_at timestamptz;

alter table public.lead_status add column if not exists whatsapp_followup2_sent boolean not null default false;
alter table public.lead_status add column if not exists whatsapp_followup2_sent_at timestamptz;
alter table public.lead_status add column if not exists whatsapp_followup2_due_at timestamptz;

alter table public.lead_status add column if not exists whatsapp_followup3_sent boolean not null default false;
alter table public.lead_status add column if not exists whatsapp_followup3_sent_at timestamptz;
alter table public.lead_status add column if not exists whatsapp_followup3_due_at timestamptz;

alter table public.lead_status add column if not exists linkedin_followup1_sent boolean not null default false;
alter table public.lead_status add column if not exists linkedin_followup1_sent_at timestamptz;
alter table public.lead_status add column if not exists linkedin_followup1_due_at timestamptz;

alter table public.lead_status add column if not exists linkedin_followup2_sent boolean not null default false;
alter table public.lead_status add column if not exists linkedin_followup2_sent_at timestamptz;
alter table public.lead_status add column if not exists linkedin_followup2_due_at timestamptz;

alter table public.lead_status add column if not exists linkedin_followup3_sent boolean not null default false;
alter table public.lead_status add column if not exists linkedin_followup3_sent_at timestamptz;
alter table public.lead_status add column if not exists linkedin_followup3_due_at timestamptz;

-- ---------------------------------------------------------------------------
-- templates: allow the 6 new WhatsApp/LinkedIn follow-up template types.
-- ---------------------------------------------------------------------------
alter table public.templates drop constraint if exists templates_template_type_check;
alter table public.templates add constraint templates_template_type_check check (template_type in (
  'cold_email', 'followup1', 'followup2', 'followup3', 'whatsapp', 'linkedin', 'sms',
  'whatsapp_followup1', 'whatsapp_followup2', 'whatsapp_followup3',
  'linkedin_followup1', 'linkedin_followup2', 'linkedin_followup3'
));
