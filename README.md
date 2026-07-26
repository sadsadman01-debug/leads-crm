# Leads CRM

A private, single-admin lead tracking system for outbound sales (cold email, WhatsApp, and multi-channel outreach). Built as a JAMstack app: static React frontend + a serverless functions API + Supabase (Postgres, Auth, Storage). Deployable to either Netlify or Vercel (see below) — the API is a single Netlify Functions router at `netlify/functions/api.ts` with a thin adapter (`api/[...path].ts`) that runs the same router unmodified as a Vercel Function.

**Phase 1**: auth, lead data model, outreach status toggles, basic list/detail views.
**Phase 2**: advanced filtering, bulk actions, CSV/Google Sheets import, CSV export, and a full analytics dashboard.
**Phase 3**: configurable pipeline stages, a drag-and-drop Kanban board, and a follow-up reminder system.
**Phase 4**: outreach templates, a per-lead activity timeline, and computed lead scoring.
**Phase 5**: industry segmentation — a structured Industry field, per-industry filtering/saved views on the Leads page, a dashboard scoped by industry, and an industry comparison table.
**Phase 6** (this update): Deals/Opportunities linked to leads, a separate configurable deal pipeline with its own Kanban board, and revenue forecasting/pipeline analytics on the Dashboard.

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS, React Router, TanStack Query
- **Backend**: a single serverless router (`netlify/functions/api.ts`) with zero runtime dependency on any Netlify-specific API — it only reads `path`/`httpMethod`/`headers`/`body`/`queryStringParameters` off its event, so it runs unmodified under either host
- **Database / Auth / Storage**: Supabase (Postgres + Supabase Auth + Supabase Storage)
- **Deployment**: Netlify **or** Vercel (static build + one serverless function, no long-running server either way)

## Project structure

```
api/[...path].ts         Vercel Function entry point — adapts a Vercel request into the same
                         HandlerEvent shape netlify/functions/api.ts expects, then delegates to it
netlify/functions/       Serverless API (auth-checked, uses the Supabase service-role key)
  api.ts                 Single router entry point (/api/*), used directly by Netlify and via the
                         adapter above by Vercel
  lib/                   auth verification, supabase admin client, http helpers, tag resolution,
                         reminders, scoring, activities (timeline logging)
  routes/                leads (filters/bulk/stage/kanban/activities), tags, attachments, importExport,
                         dashboard, pipelineStages, settings, templates, industries, dealStages,
                         winLossReasons, deals, revenue
src/
  pages/                 Login, Dashboard, Leads (list/detail/form), Deals (list), Settings
  components/            Layout, shared UI (Badge incl. ScoreBadge, Toggle, Modal), StatusPanel,
                         AttachmentsPanel, FiltersBar, BulkActionsBar, ImportModal, RemindersWidget,
                         PipelineStagesSettings, FollowUpIntervalSettings, IndustriesSettings,
                         TemplatesSettings, TemplateUsePanel, LeadTimeline, IndustryComparisonTable,
                         DealStagesSettings, WinLossReasonsSettings, DefaultCurrencySettings, DealForm,
                         LeadDealsPanel, CloseDealModal, RevenueSection, DealsClosingWidget,
                         kanban/ (Board, Column, Card, DealKanbanBoard, DealKanbanCard),
                         charts/ (StatTile, Funnel, Trend, Donut, DealFunnelChart, RevenueTrendChart)
  contexts/AuthContext   Supabase session state
  lib/                   supabase client, api client (calls /api/*), chartColors, currency
  types/lead.ts          Shared Lead/Status/Tag/Attachment/Filters/DashboardSummary/Stage/
                         Industry/Template/LeadActivity types
  types/deal.ts          Deal/DealStage/WinLossReason/KanbanDeal/RevenueSummary types
supabase/schema.sql              Full DB schema for fresh installs (includes all phases)
supabase/migrations/             Incremental SQL to run against an already-provisioned project
scripts/seed-admin.mjs           One-time script to create the single admin user
```

## How auth works

- The frontend signs in directly against **Supabase Auth** (`supabase.auth.signInWithPassword`) — no custom session server needed, which is what makes this serverless-safe on Netlify.
- Every Netlify Function verifies the caller's Supabase JWT (`Authorization: Bearer <token>`) server-side via `supabase.auth.getUser(token)` before touching the database.
- All actual reads/writes happen through Netlify Functions using the **service-role key**, not from the browser — Postgres Row Level Security only allows `select` for authenticated users as a defense-in-depth backstop; all inserts/updates/deletes are gated by the functions layer.
- There's no public sign-up route anywhere in the app.

## Local setup

1. **Create a Supabase project** at supabase.com.
2. **Run the schema**: open the SQL editor in Supabase, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates all tables, triggers, RLS policies, and the private `lead-attachments` storage bucket (fresh installs get every phase in one file — the `supabase/migrations/` folder is only for projects that already had an earlier phase's schema applied and need the incremental diff).
3. **Create the admin account** — Supabase Auth needs at least one user; there's no public sign-up UI. Run:
   ```bash
   SUPABASE_URL=https://your-project.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
   ADMIN_EMAIL=you@example.com \
   ADMIN_PASSWORD=a-strong-password \
   node scripts/seed-admin.mjs
   ```
   (Find both keys under Supabase → Project Settings → API.)
4. **Copy `.env.example` to `.env.local`** and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (also from Project Settings → API).
5. **Install and run**:
   ```bash
   npm install
   netlify dev
   ```
   `netlify dev` (from the Netlify CLI: `npm i -g netlify-cli`) runs the Vite dev server *and* the Netlify Functions together, proxying `/api/*` correctly — plain `npm run dev` will not serve the functions. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a `.env` file in the project root as well; Netlify CLI loads it for the functions runtime.

## Deploying to Netlify

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Netlify: **Add new site → Import an existing project**, pick the repo. Build command and publish directory are already set via `netlify.toml` (`npm run build` → `dist`), and the functions directory (`netlify/functions`) is picked up automatically.
3. Under **Site settings → Environment variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — server-side only, never prefixed with `VITE_`)
4. Deploy. No server to provision — Netlify builds the static frontend and deploys the functions automatically.

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New → Project**, import the repo. Framework preset "Vite" is auto-detected; build command/output directory are also pinned explicitly in `vercel.json` (`npm run build` → `dist`) so they don't drift from what Netlify uses. The catch-all Vercel Function at `api/[...path].ts` is picked up automatically from the `api/` directory — no extra config needed.
3. Under **Project Settings → Environment Variables**, add the same four variables as the Netlify setup:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never prefixed with `VITE_`)
4. Deploy. `vercel.json` handles the SPA fallback rewrite (everything except `/api/*` serves `index.html`) and the same security headers `netlify.toml` sets.
5. **How the API stays identical on both hosts**: every route/lib file under `netlify/functions/` only ever reads five fields off its event object (`path`, `httpMethod`, `headers`, `body`, `queryStringParameters`) and has no other Netlify-specific import — confirmed by grepping the entire functions tree. `api/[...path].ts` is a small adapter that builds one of those synthetic events from the incoming Vercel request and calls the exact same `handler` Netlify uses, so the two hosts run identical route logic; nothing under `netlify/functions/` needed to change for the Vercel migration. Both `netlify.toml` and `vercel.json` can coexist in the repo indefinitely — whichever host you deploy to just ignores the other's config file.

## Data model notes (for future phases)

- `profiles` mirrors `auth.users` with a `role` column, so a future multi-user phase can add teammates without touching the `leads` schema — `leads.created_by` already points at `profiles`.
- `lead_status` is one row per lead with a boolean + timestamp per outreach action (cold email, follow-ups, WhatsApp, LinkedIn, SMS, cold calls, etc.), which is what drives the colored toggle/badge UI in the lead detail view.
- Tags are normalized (`tags` + `lead_tags`) rather than a text array, so tag autocomplete and future tag-based filtering/reporting don't require re-parsing strings.
- Attachments store only metadata in Postgres (`lead_attachments`); the actual files live in the private `lead-attachments` Supabase Storage bucket, accessed only via short-lived signed URLs minted by the functions layer.
- Duplicate detection (`POST /api/leads/check-duplicate`) is a warn-only check against company name / phone / email — it does not block saving, matching the spec.

## Phase 2 additions

- **Filters** (`GET /api/leads?filters=<json>`): priority, lead source, tags, any outreach status toggle, date-added range, has-website, has-social-profile. Join-based filters (status/tags/social profiles) resolve to a set of matching lead ids first, then intersect with the main query — this avoids PostgREST's embedded-resource filter quirks (see `resolveJoinFilteredIds` in `routes/leads.ts`).
- **Bulk actions** (`POST /api/leads/bulk`, capped at 500 ids per call): mark a status field for many leads at once, add tags to many leads, or delete many leads.
- **CSV import** (`POST /api/leads/import`): rows are parsed client-side (Papaparse) and sent in batches of 400 to stay within function payload/time limits.
- **Google Sheets import** (`POST /api/leads/import/sheet`): the function fetches the sheet's CSV export server-side (sheet must be shared "Anyone with the link can view") and parses it with Papaparse. Capped at 500 rows per sheet — split larger sheets.
- **CSV export** (`GET /api/leads/export`): respects the same `filters`/`search` params as the list view; fetches up to 5,000 matching rows in chunks of 1,000 and streams back a CSV.
- **Dashboard** (`GET /api/dashboard/summary?granularity=day|week|month`): pulls all leads with their status once and aggregates outreach counts/percentages, reply sentiment, conversion rate, an outreach funnel, lead source/priority/status distributions, and a trend series in JS. Capped at 20,000 leads — fine for a single-admin CRM, but would need a real SQL aggregation (or a materialized view) well before that.
- **Chart colors** (`src/lib/chartColors.ts`): a validated categorical palette (dataviz skill's `validate_palette.js`, dark mode) for lead-source distribution; status/priority/sentiment charts reuse the same tones as their Part 1 badges so a color's meaning never changes between a table badge and a chart slice.

## Phase 3 additions

- **Pipeline stages** (`pipeline_stages` table, `/api/pipeline-stages*`): admin-configurable, ordered Kanban columns. Ships with the default sequence (Cold Email → Follow-up 1 → Follow-up 2 → Follow-up 3 → Replied → Converted); reorder via drag-and-drop in Settings (`@dnd-kit`), which calls `PATCH /pipeline-stages/reorder` with the full ordered id list. Deleting a stage is blocked while any lead is still on it. Every lead defaults to the first stage via a DB trigger (`assign_default_stage`) — this covers direct inserts too (CSV/Sheets import), not just the create-lead form.
- **Kanban board** (`GET /api/leads/kanban`, capped at 1,000 leads): a lighter-weight lead list (no tags/social profiles) grouped into columns by `stage_id`. Toggle it from the Leads page next to the existing Table view — same page, same data, different layout. Dragging a card calls `PATCH /leads/:id/stage`.
- **Follow-up reminders**: marking Cold Email / Follow-up 1 / Follow-up 2 sent stores a computed due date for the *next* step (`lead_status.followup{1,2,3}_due_at`), using the interval from `app_settings.follow_up_interval_days` (editable in Settings, default 3 days) at the moment it's computed — changing the interval later doesn't shift already-computed dates. `netlify/functions/lib/reminders.ts` is the single place that turns those stored dates into "next due / overdue / due today," reused by the leads list, lead detail, the Kanban cards, and the dashboard widget so they never disagree. A lead stops needing reminders once it's replied to or converted.
- **Dashboard widget**: `GET /api/dashboard/summary` now also returns a `reminders` block (overdue/due-today counts + a sorted list) computed from the same leads query the rest of the dashboard already fetches — no extra full-table scan.

## Phase 4 additions

- **Templates** (`templates` table, `/api/templates*`): reusable subject/body outreach copy with `{{placeholder}}` tokens (`company_name`, `address`, `phone`, `email`, `website`, `lead_source`, `priority`). Managed in Settings; used from the lead detail page (`TemplateUsePanel`) which fills the placeholders for that specific lead and copies the result to the clipboard. There's no email-sending integration — this is copy/paste only, by design (no external notification/email service).
- **Activity timeline** (`lead_activities` table, `GET /api/leads/:id/activities`): an append-only per-lead log written by the functions layer whenever something changes — lead creation (including via CSV/Sheets import), every status-toggle flip (individual or bulk), stage changes, and tag updates. `netlify/functions/lib/activities.ts` (`logActivity`/`logActivities`) is the only thing that writes to it, so every mutation path logs consistently.
- **Lead scoring**: computed on the fly from `lead_status` + `priority` (`netlify/functions/lib/scoring.ts`, mirroring the `reminders.ts` pattern) — never stored, so tuning the weights needs no migration. Surfaced as a `score`/`band` (Hot/Warm/Cold) pair on every lead the API returns (list, detail, Kanban), rendered via `ScoreBadge`.

## Phase 5 additions

- **Industries** (`industries` table, `/api/industries*`): a structured, admin-managed reference table — leads hold an `industry_id` foreign key, not a free-text string, so renaming an industry in Settings instantly relabels every lead that references it. Managed alongside pipeline stages and templates in Settings; deleting an industry is blocked while any lead still references it (same guard pattern as pipeline stages).
- **Leads page industry filter**: a horizontal pill/tab bar ("All Industries" + one per industry) above the Table/Kanban views. Selecting one sets `filters.industryId`, which flows into both the paginated table query and the Kanban board's `industryId` query param — one selection scopes both views.
- **Dashboard industry scoping**: an industry `<select>` next to the granularity picker re-runs `GET /api/dashboard/summary?industryId=...`, which filters every stat/chart to that industry's leads (via `allRows.filter` before the existing aggregation logic runs) — "All Industries" (no param) matches the original Phase 2 behavior exactly.
- **Industry comparison table**: the same dashboard endpoint groups the *unfiltered* lead set by `industry_id` (including an "Unassigned" bucket) and returns `industryComparison` — total leads, cold-email-sent %, reply rate, and conversion rate per industry — computed from the same query the rest of the dashboard already runs, so no extra full-table scan.
- **CSV/Sheets import industry mapping**: an `Industry` column is recognized like any other CSV/Sheet header and resolved by case-insensitive name match against existing industries (no auto-creation — unmatched names are left unassigned, since industries are meant to be curated in Settings). Alternatively, the admin can pick a **Default Industry** in the import modal, which overrides the per-row column for the entire batch.

## Phase 6 additions

- **Deals** (`deals` table, `/api/deals*`): a separate entity linked to a lead via `lead_id` (a lead can have zero, one, or many deals). Fields: name, value + currency, stage, probability (auto-suggested from the stage's default, overridable), expected/actual close date, outcome reason, notes, owner (`profiles.id`, structured for a future multi-user phase even though there's only one admin today). Created from a lead's detail page or directly from the Deals page (with a lead search-picker).
- **Deal stages** (`deal_stages` table, `/api/deal-stages*`): a pipeline entirely separate from the lead `pipeline_stages` from Phase 3 — same admin UI pattern (Settings, drag-to-reorder via `@dnd-kit`), plus a per-stage default win-probability % and `is_closed`/`is_won` booleans. Those booleans (not stage names) are what "is this deal closed" logic checks everywhere, so renaming "Closed Won" doesn't break anything. Ships with Qualification (20%) → Needs Analysis (40%) → Proposal Sent (50%) → Negotiation (75%) → Closed Won (100%) / Closed Lost (0%).
- **Deals Kanban** (`GET /api/deals/kanban`, capped at 1,000 deals): reuses the generic `KanbanColumn` from Phase 3 with a new `DealKanbanCard` (deal name, company, value, probability, expected-close urgency dot) and the same touch-drag-fallback `<select>` pattern. Dragging (or selecting) a stage marked `is_closed` opens `CloseDealModal` first — a win/loss reason (from the admin-editable `win_loss_reasons` list, or free-text "Other") is required before the move commits, and the actual close date defaults to today but is editable. A Table/List view is a click away via the same Table/Kanban toggle pattern as the Leads page.
- **Win/loss reasons** (`win_loss_reasons` table, `/api/win-loss-reasons*`): admin-editable suggestions only — `deals.outcome_reason` is free text, not a foreign key, so "Other: <anything>" always works and deleting a reason from the list never orphans historical deals.
- **Revenue & pipeline analytics** (`GET /api/revenue/summary?closedRange=all|month|quarter|year&industryId=...`): open/weighted pipeline value, Closed Won revenue (range-filterable) and Closed Lost value, win rate, average deal size, average sales cycle (calendar-day difference, not raw timestamp subtraction — a same-day close doesn't read as negative days), a per-stage funnel (count + value), a 12-month Closed Won revenue trend, a loss-reason breakdown, and a "closing this month" list sorted by urgency. All of it accepts the same `industryId` the rest of the Phase 5 dashboard uses, reusing the resolve-lead-ids-first join pattern from `routes/leads.ts` for correct pagination/filtering. Rendered as a new "Revenue & Pipeline" section at the bottom of the existing Dashboard (`RevenueSection`), sharing its industry selector.
- **Lead ↔ Deal integration**: a "Deals" panel on the lead detail page (`LeadDealsPanel`) lists/creates deals for that lead; marking a lead's "Converted to Client" toggle shows a dismissible quick-action banner ("create a Deal now?") as long as the lead has zero deals yet. Every deal create/stage-change/delete writes a `lead_activities` entry (reusing the Phase 4 `logActivity` helper) — e.g. `Deal "Acme Corp - Website Redesign" Closed Won ($5,000.00)`.
- **Currency**: `app_settings.default_currency` (Settings → Default Currency) is applied to new deals unless overridden per-deal from a fixed list (`USD`, `EUR`, `GBP`, `CAD`, `AUD`, `INR`). Formatting uses `Intl.NumberFormat` (`src/lib/currency.ts`) rather than a hardcoded symbol map. **No FX conversion** is performed anywhere (no paid external API, per the brief) — revenue totals are a raw sum across whatever currencies the underlying deals use, which is only meaningful if you stick to one currency in practice.

## Phase 7 additions

- **Three-tier roles** (`profiles.role`: `super_admin` | `admin` | `user`): exactly one Super Admin (the original seeded account, promoted by migration 005), any number of Admins and Users. `profiles` also gained `nickname` and `is_active`. `netlify/functions/lib/auth.ts`'s `requireUser` now loads the caller's role/nickname/active-status alongside the JWT check on every request, and rejects deactivated accounts even if their token hasn't expired yet.
- **Team Management** (`profiles` + Supabase Auth Admin API, `/api/team-members*`, `/api/team-members/roster` for the lightweight everyone-can-read roster used in assignment dropdowns): Admin/Super Admin only. Creating a member calls `supabase.auth.admin.createUser({email_confirm: true})` server-side with the service-role key (`routes/team.ts`), then sets nickname/role — the password is admin-set directly, no invite email. Deactivating bans the account at the Supabase Auth level (`ban_duration`) so it can't sign in even mid-session, and optionally bulk-reassigns that member's leads/deals to another active member (or unassigns them). Only the Super Admin can change roles, edit/deactivate Admins, or permanently delete an account (typed-confirmation safety net; orphaned records reassign to the Super Admin).
- **Permission enforcement — two layers**: (1) every Netlify Function that mutates a lead/deal/settings-table independently re-checks the caller's role/ownership server-side (`netlify/functions/lib/permissions.ts`) before touching the database — this is what actually gates every write, since all writes go through the service-role key; (2) matching RLS policies were added to `leads`/`deals` (update/delete requires admin-or-above OR being the assigned owner/creator) and to every settings-type table (write requires admin-or-above) as the database-level backstop the spec calls for, in case the authenticated-role key is ever used directly. `profiles` SELECT was opened to all authenticated users (previously own-row-only) since nicknames/roles now need to be visible team-wide for badges/filters.
- **Lead/deal assignment**: `leads.assigned_to` (new column) and the existing `deals.owner_id` are now real, user-facing fields — auto-set to the creator on insert, reassignable by an Admin/Super Admin or by the current owner handing it off. Surfaced as an avatar+name badge on lead/deal rows and Kanban cards, with an "Assigned To" filter (including a one-click "My Leads"/"My Deals" toggle) on both list views. A `user`-role account can edit/delete only records they're assigned to or created; everything else renders read-only (toggles, stage/industry selects, edit/delete buttons disabled or hidden).
- **Team Performance** (Admin/Super Admin only, `dashboard.teamPerformance` in `GET /api/dashboard/summary`): per-member leads/cold-emails/reply-rate/conversion-rate plus deals/won/revenue/win-rate, rendered as a comparison table (`TeamPerformanceTable`) matching the Phase 5 Industry Comparison pattern. The Dashboard and Revenue endpoints both accept an `assignedTo` param; for `user`-role callers it's forced server-side to their own id regardless of what the client sends, so Users always see only their own stats and never get a team-member selector.
- **Activity timeline attribution**: `GET /api/leads/:id/activities` now joins `profiles` and returns `actor_name`, rendered with a small avatar next to each entry in `LeadTimeline`.
- **Sidebar/login**: the account panel now shows nickname, avatar initial, and a color-coded `RoleBadge` (Super Admin/Admin/Warn-toned Admin/neutral User) instead of a bare email; the "Team" nav item is hidden entirely for `user`-role accounts. Navigating directly to `/team` as a User redirects to `/dashboard` with a dismissible "you don't have access" banner (`RequireAdmin` in `ProtectedRoute.tsx`) rather than a broken page.
- **Settings read-only mode**: for `user`-role accounts, every settings section is wrapped in a native `<fieldset disabled>` (so every nested input/select/button is inert without touching each settings component individually) plus a "View only — contact your admin to change this" banner.
- **Scope note**: the spec's permission matrix also lists "custom fields" and "lead scoring weights" as settings needing role-gating — neither exists as a real feature in this app (scoring is hardcoded logic in `lib/scoring.ts`, not an admin-editable setting), so there was nothing to restrict there; every settings area that *does* exist got the admin-only write gate.

## Phase 8 additions — multi-tenant SaaS conversion

- **Organizations** (`organizations` table, `/api/organizations*`, Super Admin only): one row per tenant/customer. The Super Admin belongs to none (their `profiles.organization_id` is `null`); every Admin/User belongs to exactly one. `organization_id` was added to every previously shared table — `profiles`, `leads`, `deals`, `pipeline_stages`, `deal_stages`, `industries`, `templates`, `win_loss_reasons`, `tags`, `app_settings` — with `on delete cascade` so deleting an organization cleanly removes everything scoped to it.
- **Org resolution, not trust**: `netlify/functions/lib/permissions.ts`'s `resolveOrganizationId(user, event)` is the single source of truth every route calls — Admin/User accounts are always forced to their own `organization_id` regardless of what the client sends; only the Super Admin may pass a specific `?organizationId=` (or the `__personal__` sentinel for their own sandbox) to act within a chosen tenant. Every list/get/create/update/delete across leads, deals, pipeline/deal stages, industries, templates, win/loss reasons, tags, settings, dashboard, revenue, CSV/Sheets import+export, and attachments was audited and scoped through this same helper (`scopeToOrg` for reads, explicit `organization_id` stamping on writes, `requireRowInOrgScope`/per-row checks before rename/delete) — this was the highest-risk part of the phase, since missing even one query would leak one tenant's data to another.
- **RLS rework**: every org-scoped table's policies now additionally require `organization_id = current_org_id()` (Super Admin bypasses via `is_super_admin()`), on top of the Phase 7 role/ownership checks — the same two-layer model (function-level checks are what actually gates every write; RLS is the database-level backstop).
- **Legacy data migration**: existing Part 1-7 leads/deals/settings (created under the original single-admin account, now the Super Admin) get `organization_id = null` — i.e. they become private to the Super Admin's personal workspace, per spec, rather than assigned to any Organization. Any Admin/User accounts that already existed before Organizations existed are auto-migrated into a new "Default Organization" so they remain valid (every Admin/User must belong to exactly one org going forward).
- **`app_settings` redesign**: was a single global singleton row; now one row per organization (created lazily on first access via `getOrCreateSettingsRow`) plus one for the Super Admin's personal scope, keyed by a unique index on `organization_id` (partial-unique on `organization_id is null` for the personal row).
- **Admin account creation** (`POST /api/organizations`, Super Admin only): collects Organization Name + Admin email/password/nickname; creates the organization row, the Admin's Supabase Auth account, and links the profile as a best-effort atomic operation (rolls back the organization if user creation fails, rolls back both if the profile link fails). This is now the *only* way Admin accounts get created — Team Management (`/api/team-members`) only ever creates Users, and only within the caller's own organization.
- **Organizations Overview** (`src/pages/Organizations/OrganizationsOverview.tsx`, Super Admin's default landing page): platform-wide stat tiles (organizations/users/leads/pipeline value) plus a comparison table per organization (admin, users, leads, deals, open pipeline, status, created date) — same visual pattern as the Phase 5 Industry Comparison and Phase 7 Team Performance tables. "Enter" drills into that organization's own Dashboard/Leads/Deals/Team/Settings with full edit rights; "My Personal Workspace" switches to the Super Admin's own `organization_id = null` sandbox. Suspending an organization deactivates+bans its Admin and every User (`updateOrganizationStatus`); permanent deletion (typed-confirmation) removes every member's auth account then the organization row, cascading to all its data.
- **Org-scope injection on the frontend** (`src/lib/orgScope.ts`): a small module holding "which organization is currently being viewed," synced from a new `OrgContext` whenever the Super Admin enters/exits an organization. The shared `request()` wrapper in `src/lib/api.ts` transparently appends `?organizationId=` to every call when a scope is set — this meant zero call-site changes across the ~40 existing API functions; Admin/User sessions never set this (the server enforces their own org regardless).
- **Sidebar**: Admin/User now see their Organization's name below the logo; the Super Admin sees which organization (or "My Personal Workspace") they're currently viewing, plus a "Switch organization" link back to the Organizations Overview, and an always-visible "Organizations" nav item.
- **Scope note**: role changes (promoting a User to Admin) were removed from Team Management in this phase — each organization has exactly one Admin (its owner, fixed at organization-creation time), so promoting/demoting would either create a second Admin or leave an organization headless, neither of which the new model supports.

## Phase 9 additions — multi-currency support with live exchange rates

- **Expanded currency list**: `USD, BDT, EUR, GBP, INR, AUD, CAD, AED, SGD, JPY, CNY, CHF, NZD, ZAR, BRL` (`src/types/deal.ts`'s `CURRENCIES`, mirrored server-side in `settings.ts` for validation), each rendered as `"CODE (symbol)"` via `currencyLabel()`/`CURRENCY_SYMBOLS`. Per-Organization "Default Currency" (Phase 6/8) is unchanged in scope — still Admin/Super-Admin-editable, org-scoped — but now also doubles as the Revenue dashboard's default Display Currency.
- **`exchange_rates` cache** (`exchange_rates` table — platform-wide, NOT organization-scoped, since rates are universal): `netlify/functions/lib/exchangeRates.ts`'s `getOrRefreshRates()` reads the cached row and only calls the free, keyless `https://open.er-api.com/v6/latest/USD` endpoint (server-side only, never from the browser) when the cache is missing or older than ~20 hours — comfortably under the source's "no more than hourly" usage policy given it only actually updates once/24h. No cron job needed: the check-and-refresh happens inline whenever `GET /api/revenue/summary` or a deal-closing mutation runs.
- **Conversion utility** (`convertAmount(amount, from, to, rates)` in the same file): converts via the cached USD-based rates (amount ÷ rate[from] × rate[to]); unknown currency codes pass through unconverted rather than corrupting a total.
- **Display Currency on the Revenue dashboard** (`GET /api/revenue/summary?displayCurrency=...`, defaults to the organization's Default Currency): every aggregate figure (open/weighted pipeline, Closed Won/Lost, avg deal size, per-stage funnel, 12-month trend) is now converted into one selected currency before summing — previously these were raw same-currency sums with a documented "don't mix currencies" caveat; that limitation is now resolved.
- **Historical accuracy for closed deals**: `deals.closed_exchange_rate_snapshot` (jsonb) locks in the full rates table at the moment a deal is marked Closed Won/Lost (`updateDealStage` in `routes/deals.ts` calls `getOrRefreshRates()` and stores the result; reopening a deal clears the snapshot). Revenue aggregation uses this frozen snapshot for closed deals and only falls back to the live cached rate for deals closed before this phase shipped (no snapshot present) — so historical revenue figures never silently drift as live rates move, matching standard accounting practice. Open/pipeline deals always convert at the live rate since their outcome isn't finalized yet.
- **Individual deals are never touched**: a deal's own stored `value`/`currency` is always the source of truth: everywhere a specific deal renders (Deal cards, `DealsClosingWidget`, DealsList/Kanban), it still shows its own original entered amount — conversion is purely an aggregation/display layer. `DealsClosingWidget` adds a small subtle currency-code pill (with a tooltip) next to any deal whose own currency differs from the currently selected Display Currency, so the discrepancy is visible without cluttering the row.
- **Transparency**: the Revenue section shows "Rates updated {relative time}" next to the Display Currency selector, and a small discreet "Exchange rates by ExchangeRate-API" attribution link at the bottom (linking to exchangerate-api.com) — required by their free-tier terms, styled to blend into the existing dark theme rather than stand out.

## Phase 10 additions — custom fields on Leads/Deals

- **Custom Fields Builder** (Settings, `custom_field_definitions` table, `/api/custom-fields*`, Admin/Super Admin only per-organization): admins define Field Label, Applies To (Leads/Deals/Both), Field Type (Text, Number, Date, Dropdown, Multi-select, Checkbox, URL, Long text), an Options list for select types, Required, and an optional Default Value — reorderable via the same drag-and-drop pattern as Pipeline Stages (`@dnd-kit`), with a live preview of the actual input control while configuring it. Deleting a field is a soft-delete (`is_active = false`): it disappears from forms/the builder immediately, but any values already stored on existing leads/deals are left untouched rather than destroyed.
- **Storage**: rather than a separate values table, custom field values live directly in a `custom_fields` jsonb column (GIN-indexed) on `leads` and `deals`, keyed by field-definition id — simpler to merge/update than a join table, and avoids an extra query on every lead/deal fetch.
- **Rendering**: a shared `CustomFieldsSection` component (`src/components/CustomFieldsSection.tsx`) renders the correct control per field type and is reused verbatim by both `LeadForm` and `DealForm`, filtered by `applies_to`. `CustomFieldsDisplay` shows the same values read-only on the Lead detail page. Required-field validation and duplicate/data-loss-safe merging (`lib/customFieldValues.ts`'s `mergeCustomFieldValues`) happen server-side — the API only ever accepts values matching a known, active, in-scope field definition id, silently ignoring anything else rather than trusting arbitrary client-supplied keys.
- **Activity timeline**: changing a custom field's value on an existing lead or deal logs a timeline entry ("Custom field 'Budget Range' updated to '$10k-$25k'"), reusing the Phase 4 `logActivity`/`logActivities` mechanism — attribution ("by Sarah") comes from the same `actor_name` join already used for every other timeline entry.
- **CSV/Sheets import & export**: any import column header that doesn't match a standard field is checked against active custom field labels (case-insensitive) and auto-mapped — the same convention already used for the Industry column. Checkbox values accept Yes/true/1, multi-select values split on commas. CSV export appends one column per active custom field alongside the existing standard columns.
- **Table columns**: the Leads table gets a "Manage Columns" toggle (visible only when custom fields exist) to show/hide each custom field as an extra column, so the default table view stays uncluttered.
- **Organization isolation**: `custom_field_definitions` follows the exact same `organization_id` + RLS pattern established in Phase 8 (readable within your org, writable by admin-or-above only) — one organization's custom fields are completely invisible to another's, including the Super Admin's own personal/sandbox scope.
- **Scope note**: filtering/sorting the Leads table by custom field value, and a dedicated CSV column-mapping UI (beyond the automatic label-match), were not built in this pass to keep the change bounded — auto-mapping by label already covers the common case, and can be revisited if a customer needs explicit column mapping.

## Phase 11 additions — reporting, forecasting & quotas

- **Custom Report Builder** (`saved_reports` table, `/api/reports*`, Admin/Super Admin to build/save, any org member to run): pick a Report Type (Leads/Deals/Activity), a Group By dimension (Industry, Team Member, Pipeline Stage, Lead Source, Month, or any Dropdown-type custom field), filters (date range, priority, industry, assigned team member — reusing the same values already used elsewhere in the app), and a visualization (Table/Bar/Line/Donut/Table+Chart), with a live preview while configuring (`netlify/functions/lib/reportEngine.ts`). 5 starter templates ("Leads by Source," "Conversion Funnel by Industry," "Deals by Stage," "Revenue by Month," "Team Outreach Volume") open pre-filled in the builder for one-click use or customization. A report marked "Visible to all team members" is readable (read-only) by Users from their own Reports page even though the Builder itself stays Admin/Super-Admin-only.
- **Report engine scope note**: the aggregation engine computes real counts/sums/rates per group (lead counts, reply/conversion rate, deal totals converted to display currency, win rate) rather than a fully arbitrary pivot-table/column-selection engine — this covers every example in the spec (including the 5 starter templates) without the far larger scope of a generic query builder. Tag-based filtering in reports was left out of this pass for the same reason; date/priority/industry/assigned-team-member/custom-field filters all work.
- **CSV/PDF export**: every report view (custom or pre-built) can be exported as CSV (Papaparse, client-side) or PDF (`jspdf` + `jspdf-autotable`, dynamically imported so it doesn't bloat the main bundle) — both fully client-side, no paid service.
- **Sales Forecasting** (`GET /api/forecast`): projected revenue for this month/quarter/next quarter = (open deal value × win probability) for deals expected to close in that period, plus revenue already Closed Won in it — reusing the Phase 6 currency-conversion utility (live rate for open deals, the deal's locked-in closing-time snapshot for Closed Won ones). Rendered as a progress bar per period with on-track/at-risk/behind color states (pace-adjusted for how much of the period has elapsed).
- **Quotas** (`quotas` table, Settings, Admin/Super Admin only): a monthly or quarterly revenue goal for the whole organization or for an individual team member; the Forecast tab reads whichever quota matches the period + selected team member (or "Whole Organization").
- **Trends & period comparisons**: a Trends tab (Reports → Trends) shows Month-over-Month/Quarter-over-Quarter change for new leads, conversion rate, revenue, and average deal size with green/red up/down indicators; the Dashboard gets three always-visible "This Month vs Last Month / This Quarter vs Last Quarter / This Year vs Last Year" cards for the same headline metrics (`GET /api/trends/period-comparisons`, one call covering all three).
- **Scope note — deferred**: forecast-accuracy history ("last month's forecast was $X, actual was $Y"), cohort conversion analysis, and an "average time in stage" report were **not** built in this pass. The first would require snapshotting forecasts as they're made over time (a new data-collection mechanism not yet in place — today's forecast is always computed live, so there's no historical forecast value to compare against). The latter two would require stage-transition timestamps, which the app has never recorded (only each lead/deal's *current* stage is stored) — building them accurately needs a new stage-history table capturing entry/exit times, which can't be backfilled for existing historical data and was out of scope for this pass. All three are flagged in the Trends tab UI so this isn't a silent gap.
- **Organization isolation**: `saved_reports` and `quotas` follow the same `organization_id` + RLS pattern as every other settings-type table from Phase 8 — reports and quotas from one organization are never visible to another, including the Super Admin's personal scope.

## Phase 12 additions — Lead Detail navigation & Template Preview

- **Contact Person Name** (`leads.contact_name`, optional): a new field on the Add/Edit Lead form, separate from Company Name, so outreach can address a specific person. Shown in the Contact Info card on Lead Detail when filled; left out of CSV import/export mapping to keep this pass focused on the form/detail view/template system as specified.
- **Template Type categorization** (`templates.template_type`, one of Cold Email/Follow-up 1/2/3/WhatsApp/LinkedIn/SMS): every template now requires a type; email-type templates keep Subject + Body, WhatsApp/LinkedIn/SMS templates drop the Subject field entirely. Settings → Templates groups saved templates under a badge per type, and supports any number of templates per type. An "Insert Placeholder" menu above the Body editor lists every standard merge field plus the organization's actual custom field labels, inserting `{{tag}}` at the cursor on click.
- **Shared merge-field engine** (`src/lib/mergeFields.ts`): a single `fillTemplate(text, lead, context)` function used everywhere a template is rendered. Supports `{{company_name}}`, `{{contact_name}}`, `{{website}}`, `{{address}}`, `{{phone}}`, `{{email}}`, `{{industry}}`, `{{lead_source}}`, `{{assigned_to}}` (nickname), and `{{custom.FieldLabel}}` for any custom field (matched case-insensitively by label). Whitespace inside braces is trimmed (`{{ company_name }}` still resolves); a recognized-but-empty field substitutes to `''` and is reported back for a non-blocking "⚠ field is empty for this lead" note in the preview, while a genuinely unrecognized tag is left as literal text rather than silently deleted, so a typo doesn't disappear without a trace.
- **Lead Detail Template Preview panel**: replaces the old single-dropdown template picker with a Template Type dropdown → specific-template dropdown → live rendered preview (Subject bold + Body for email types, Message only for WhatsApp/LinkedIn/SMS) using this exact lead's real data, plus a single "Copy to Clipboard" button that flashes "Copied ✓" — intentionally no "Open in WhatsApp/Email/SMS app" buttons, per spec.
- **Lead Detail Previous/Next navigation**: `← Previous` / `Next →` controls next to `← Back to Leads`, with a "Lead X of Y" position indicator. Navigation order follows whatever filter/search/sort context the admin arrived from (the Leads table view or a Dashboard drill-down, both passed via router state); a direct URL with no prior context defaults to the organization's full list sorted by Date Added, descending. Previous is disabled on the first lead, Next on the last.
- **Scope note**: the navigation window is capped at the first 100 matching leads (mirroring the existing Kanban 1000-item and bulk-action 500-id caps elsewhere in the app) — if the current lead falls outside that window, Previous/Next and the position indicator hide rather than break.
- **Organization isolation**: the navigation query and Template Preview panel reuse the existing org-scoped `leadsApi`/`templatesApi`/`customFieldsApi` calls, so a User only ever navigates through or previews templates against leads they're already permitted to see — no new cross-tenant surface was introduced.

## What's intentionally deferred to later phases

- Nothing outstanding from the original single-admin scope — Phase 7 completed the multi-user roles/permissions work, and Phase 8 completed the multi-tenant organization isolation noted here in earlier phases.
