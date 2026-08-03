-- ============================================================================
-- Public Payment Form/Link — Receiving Payment Accounts
-- Super-Admin-managed list of accounts THEY receive customer payments into
-- (the reverse direction of payout_methods, which pays affiliates OUT).
-- Powers the public /pay instructions page — no payment gateway involved,
-- this only displays destination details and captures the payer's
-- self-reported method; actual money movement stays entirely manual.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create table if not exists public.receiving_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  method_type text not null check (method_type in ('mfs', 'bank_account', 'crypto')),
  label text not null,
  details jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists receiving_payment_accounts_order_idx on public.receiving_payment_accounts (display_order);

alter table public.receiving_payment_accounts enable row level security;

-- Same pattern as platform_settings (which backs the public pricing endpoint):
-- Super-Admin-only at the RLS layer — the public /pay page's list of active
-- accounts is served by a serverless function using the Service Role key,
-- never a direct client query, so this stays private from any direct table access.
drop policy if exists "receiving_payment_accounts super admin only" on public.receiving_payment_accounts;
create policy "receiving_payment_accounts super admin only" on public.receiving_payment_accounts
  for select using (public.is_super_admin());
