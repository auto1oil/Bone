# Clone playbook — stand up a sister app from the Stallion Tank codebase

For an agent building a new app that is this app with a different company name, also
connected to the Auto 1 Funding (QuickPay) factoring hub.

**You start from the full Stallion repository** (github.com/auto1oil/Stallion — the
owner will grant you the repo, or hand you a zip of it). The codebase IS the product:
field tickets with 16 GPS-stamped load lines, orders with two-rate margin protection,
hauler dispatch + accept + driver assignment, audit-by-exception with a verify panel,
typed-name signatures, a paper-identical ticket PDF, QuickBooks invoicing with the PDF
attached, Factor/Standard pay with the funding-app link gate and signed bill of sale,
session-only sign-ins with a login log. None of that changes. Only the identity does.

**Rule zero: this is a NEW app, not a branch.** Create a fresh GitHub repo, a fresh
Supabase project, a fresh Vercel project. Never push to auto1oil/Stallion, never point
at Stallion's Supabase, never reuse its QuickBooks connection. The ONLY shared service
is the funding app — and even there the new app gets its own identity (below).

---

## 0. Collect before you start

- Company name (e.g. "Acme Tank"), a short slug (e.g. `acme-tank`), legal entity name
  for the PDF header, office address + office email, and the logo artwork.
- A new Supabase project (its URL, anon key, service-role key).
- A new Vercel project (and the production domain).
- From the funding app's agent: endpoints + a NEW API key for source `acme-tank`
  (one-line ask: "same contract as stallion-tank, new source <slug>, issue a key").
- A QuickBooks Online company for this entity + an Intuit app (client id/secret,
  redirect URI pointing at the new domain).

## 1. Repository

1. Copy the Stallion repo contents into a fresh repo (new history is fine).
2. Keep `CLAUDE.md` — it is the working agreement (ship code + SQL both halves, give
   the user paste-ready SQL and a verification query, keep `supabase-setup.sql`
   idempotent, approvals server-side, money recomputed never trusted). Swap the names
   in it; keep every rule. It is how this codebase stays correct.

## 2. Rebrand pass (the complete list — nothing else carries identity)

**Mechanical rename.** "Stallion"/"stallion" appears in ~40 source files, almost all as
user-facing copy ("the Stallion office", "hauling for Stallion") or comments. A global
case-aware find/replace of: `Stallion Tank` → `Acme Tank`, `Stallion` → `Acme`,
`stallion-tank` → `acme-tank`, `stalliontank.com` → the new domain, then a manual read
of the diff, covers it. Leave table names, bucket names, and CSS classes alone — they
are internal and renaming them buys nothing.

**Files needing real decisions, not just find/replace:**
- `public/brand/stallion-logo.png / stallion-mark.png / stallion-icon.png` — replace
  with the new artwork (rename files + their references): full logo (used on login,
  nav, marketing), bare mark (favicon + PDF header), maskable icon (PWA). Keep a
  transparent background on the logo, solid plate on the maskable icon.
- `public/manifest.webmanifest` — name, short_name, icons.
- `app/layout.tsx` — site metadata (title etc.).
- `lib/ticket-pdf.ts` — the printed header block is HARDCODED by design to mirror the
  paper pad: company legal name ("STALLION TANK LLC"), the sheet heading, the address
  lines ("150 North Main / St. Suite 102 / Bountiful, UT 84010 /
  Office@Stalliontank.com"). Put the new entity's real details there.
- `lib/factoring.ts` — `source: 'stallion-tank'` appears in every payload (tickets,
  bill-of-sale, link-request, link-status). Change ALL of them to the new slug. This is
  the app's identity at the funding hub; two apps must never share one.
- `app/home/page.tsx` + `app/legal/*` — marketing copy, terms, privacy, contact block.
- `app/haulers/… / app/hauler/…` copy — "hauling for Stallion" style phrases (caught by
  the rename, listed here so the diff read checks them).

## 3. Database — one file is the whole schema

1. In the NEW Supabase project's SQL editor, run `supabase-setup.sql` top to bottom.
   It is the canonical, idempotent schema: 30+ tables, RLS, triggers, storage buckets,
   grants. Safe to re-run any time; re-running applies accumulated changes.
2. Seed the first login: Dashboard → Authentication → Add user (email + password,
   auto-confirm), then in SQL:
   ```sql
   update public.profiles
   set role = 'master_admin', must_change_password = false
   where email = 'owner@newco.com';
   ```
3. Every later schema change goes into `supabase-setup.sql` (idempotent: `if not
   exists`, `create or replace`, `drop policy if exists`) AND is pasted to the user as
   a delta block with a verification query — the agent cannot run SQL on production;
   the user runs it in the SQL editor. One-off destructive changes go in `migrations/`.
4. Ordering trap that bites twice a year: policy expressions resolve function
   references at CREATE time. A function used by a policy must be defined EARLIER in
   the file (see `is_admin`/`is_master_admin`/`my_hauler_id` in section 1). Verify any
   schema change by running the whole file twice against a scratch database.

## 4. Environment variables (Vercel → Settings → Environment Variables)

Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — the new project's.
- `NEXT_PUBLIC_SITE_URL` — the new production URL.
- `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT`
  (`production` or `sandbox`), `QUICKBOOKS_REDIRECT_URI`
  (`https://NEW-DOMAIN/api/quickbooks/callback`).
Optional (feature-gated):
- Web push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  (generate a fresh VAPID pair; do not reuse Stallion's), `PUSH_DISPATCH_SECRET`
  (also stored in app_settings `push_dispatch_url`/`push_dispatch_secret` for the
  DB-side trigger), `CRON_SECRET`, `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`,
  `QB_PO_FIELD_NAME`, `QB_SALESMAN_FIELD_NAME`.
Local dev: the same NEXT_PUBLIC_* + service key in `.env.local` (gitignored).

## 5. In-app configuration (as the master admin, after first deploy)

1. **QuickBooks**: Settings → QuickBooks → Connect (OAuth against the new QB company),
   then Work Orders → Setup → pick the QuickBooks item tickets bill against.
2. **Funding app**: Work Orders → Setup → "Factoring app" card (master admin only):
   paste the endpoint URL (must end in `/tickets`) and the API key issued for YOUR
   source. The full contract — link-request/link-status per-company gate the funding
   admin can flip any time, bill-of-sale signed at Factor-Payment time, approved-ticket
   hand-off that never blocks approvals, 403 {"status"} handling, idempotency per
   ticket_id, hauler_id + supervisor_name/supervisor_signed_at in every payload — is
   already implemented in `lib/factoring.ts`; the companion document
   `funding-app-connection-handoff.md` explains it endpoint by endpoint.
3. **Audit fields**: the audit queue's column chooser (saved to app_settings).

## 6. Verify before handing it over (the same loop Stallion runs)

- `npx tsc --noEmit && npm run build` clean.
- Schema file runs twice in a row against a fresh scratch database without error.
- The business loop end to end: create order (customer rate + hauler pay rate) →
  Send pill dispatches N trucks to a hauler → hauler accepts + assigns a driver →
  driver stamps load lines (floating next-stamp button) → foreman types name + signs →
  Share makes the paper-style PDF → office audit panel → approve → QB invoice with the
  PDF attached. Then the funding loop: hauler requests the link → funding admin
  approves → Factor Payment appears → bill of sale signed → complete → office approve →
  deal lands "Clear to fund"; flip the link off and confirm the button vanishes.
- Adversarial spot-checks: a hauler login cannot read `job_orders` (customer rates),
  cannot set its own `factoring_link_status` or `active`, cannot edit order-owned
  ticket fields (server strips them), cannot see another company's anything.

## 7. Operating notes inherited from Stallion (keep these habits)

- Money: the client shows live math; `lib/work-orders.ts` recomputes from raw rows at
  invoice time. Billing follows `rate_unit` (hour/ton/load/day); tonnage on an hourly
  ticket is information, not a bill. Never bill a browser-posted number.
- Two rates: `job_orders.rate` (customer) vs `pay_rate` (hauler). Haulers can never
  read the order book; dispatched loads carry only the pay rate.
- A failed external call (QuickBooks, funding app) never rolls back an approval —
  record it on the row, offer a retry button.
- Sign-ins are session-only (cookie lifetime stripped in supabase-browser, supabase-
  server, AND middleware — all three must agree) and every login is recorded in
  `login_events` (master-admin-only read).
- Password resets without email:
  `update auth.users set encrypted_password = extensions.crypt('Temp', extensions.gen_salt('bf')) where email = '...';`
  plus `must_change_password = true` on the profile — or the admin Users page.
- Supabase free tier: the platform auth audit table stays empty; `login_events` is the
  app's own record. `notify pgrst, 'reload schema';` after any pasted DDL.
