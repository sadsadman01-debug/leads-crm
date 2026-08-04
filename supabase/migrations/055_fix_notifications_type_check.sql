-- ============================================================================
-- Bug fix: notifications.type's CHECK constraint (notifications_type_check)
-- was last updated in migration 036 (product reviews) and was never extended
-- when 'cancellation_request' (049), 'org_referral_reward' (050), or
-- 'announcement' (051) were added to the application-level NotificationType
-- union. Every attempt to insert a notification of one of these three types
-- has been silently failing at the database layer ever since — silent
-- because createNotification/createNotifications treat a failed insert as a
-- best-effort side-channel failure (console.error only, never thrown), so a
-- targeted Announcement (or a Business Referral reward, or a Cancellation
-- request notification) reports success while zero notification rows are
-- actually created. This affected EVERY audience, not just "Specific
-- Organizations" — 'announcement' rows were rejected regardless of who they
-- were fanned out to.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'signup_request', 'password_reset_request', 'lead_assigned', 'deal_assigned',
  'follow_up_overdue', 'deal_closing_soon', 'deal_closed_won', 'deal_closed_lost',
  'mfa_reset_request', 'affiliate_application', 'withdrawal_request', 'product_review_reply',
  'cancellation_request', 'org_referral_reward', 'announcement'
));
