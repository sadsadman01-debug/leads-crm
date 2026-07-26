-- ============================================================================
-- Onboarding Checklist (Admin "Getting Started" widget)
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Only `dismissed`/`completed_at` are persisted — individual step-completion
-- states are computed live from existing data (lead/deal/template/industry/
-- pipeline-stage counts, team roster, branding fields) on every read, so
-- there's nothing else to keep in sync or drift out of date.
alter table public.organizations
  add column if not exists onboarding_dismissed boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;
