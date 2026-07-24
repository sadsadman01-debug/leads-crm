# Leads CRM

A private, single-admin lead tracking system for outbound sales (cold email, WhatsApp, and multi-channel outreach). Built as a JAMstack app for Netlify: static React frontend + Netlify Functions API + Supabase (Postgres, Auth, Storage).

**Phase 1**: auth, lead data model, outreach status toggles, basic list/detail views.
**Phase 2** (this update): advanced filtering, bulk actions, CSV/Google Sheets import, CSV export, and a full analytics dashboard.

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS, React Router, TanStack Query
- **Backend**: Netlify Functions (serverless), single router at `netlify/functions/api.ts`
- **Database / Auth / Storage**: Supabase (Postgres + Supabase Auth + Supabase Storage)
- **Deployment**: Netlify (static build + functions, no long-running server)

## Project structure

```
netlify/functions/       Serverless API (auth-checked, uses the Supabase service-role key)
  api.ts                 Single router entry point (/api/*)
  lib/                   auth verification, supabase admin client, http helpers, tag resolution
  routes/                leads (incl. filters/bulk), tags, attachments, importExport, dashboard
src/
  pages/                 Login, Dashboard, Leads (list/detail/form), Settings
  components/            Layout, shared UI (Badge, Toggle, Modal), StatusPanel, AttachmentsPanel,
                         FiltersBar, BulkActionsBar, ImportModal, charts/ (StatTile, Funnel, Trend, Donut)
  contexts/AuthContext   Supabase session state
  lib/                   supabase client, api client (calls /api/*), chartColors
  types/lead.ts          Shared Lead/Status/Tag/Attachment/Filters/DashboardSummary types
supabase/schema.sql       Full DB schema, RLS policies, storage bucket setup
scripts/seed-admin.mjs    One-time script to create the single admin user
```

## How auth works

- The frontend signs in directly against **Supabase Auth** (`supabase.auth.signInWithPassword`) — no custom session server needed, which is what makes this serverless-safe on Netlify.
- Every Netlify Function verifies the caller's Supabase JWT (`Authorization: Bearer <token>`) server-side via `supabase.auth.getUser(token)` before touching the database.
- All actual reads/writes happen through Netlify Functions using the **service-role key**, not from the browser — Postgres Row Level Security only allows `select` for authenticated users as a defense-in-depth backstop; all inserts/updates/deletes are gated by the functions layer.
- There's no public sign-up route anywhere in the app.

## Local setup

1. **Create a Supabase project** at supabase.com.
2. **Run the schema**: open the SQL editor in Supabase, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates all tables, triggers, RLS policies, and the private `lead-attachments` storage bucket.
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

## What's intentionally deferred to later phases

- Kanban board, reminders/templates, lead scoring
- Multi-user roles/permissions (schema already supports adding this)
