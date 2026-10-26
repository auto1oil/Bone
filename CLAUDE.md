# Bone — working agreement

## Ship both halves, every time

A change is only done when **both** halves are delivered:

1. **Code** — committed and pushed.
2. **Database** — any schema/policy/function change applied in Supabase.

The assistant **cannot run SQL** against the database; only the user can, in
the Supabase SQL editor. So for anything that touches the DB:

- Put the change in `supabase-setup.sql` (idempotent: `if not exists`,
  `create or replace`, `drop policy if exists`). The whole file must stay safe
  to re-run — re-running it applies every accumulated change at once.
- **Also** paste the exact SQL into chat as a copy-paste block (mobile-friendly:
  no `<`/`>` tokens the editor mangles, no `alias.id` forms).
- One-off destructive changes (drops, backfills) go in `migrations/` as a
  numbered file, never into `supabase-setup.sql`.

### Verify the DB side — don't assume it ran

After giving SQL, give a one-line verification query and ask for the result.
Don't call the task done until the count proves it, e.g.
`select count(*) from public.work_orders;`

### When the user says "it didn't show up"

Check in this order and report which one it was:
1. Is the code actually pushed and deployed?
2. Is the SQL applied? (verification query — usually the gap.)
3. Is the PWA showing a cached bundle? (hard-refresh / reopen.)

## Repo facts

- This app is a sister of Stallion Tank, stood up from that codebase per
  `docs/new-app-clone-playbook.md`; the funding-app contract is in
  `docs/funding-app-connection-handoff.md`. Own repo, own Supabase, own Vercel,
  own QuickBooks; the funding app is the only shared service and this app's
  identity there is `BRAND.slug` in `lib/brand.ts`.
- `lib/brand.ts` — the company's name, legal name, address, phone, email,
  domain and funding `source`. Nothing else carries identity.
- `lib/truck-types.ts` — the TYPE OF TRUCK list from the Bone paper pad and
  the 28-load-line limit (two columns of fourteen).
- `lib/ticket-pdf.ts` — the haul ticket PDF, laid out to mirror the Bone pad.
- Live progress to the funding app: `sendTicketProgress` in `lib/factoring.ts`
  posts an in-progress preview of a ticket to `{base}/progress` — only for a
  hauler whose link is `linked`, only while the ticket is open, only when
  something changed. Pinged from the form and the load lines, swept every
  five minutes by `/api/cron/factoring-progress`. Contract:
  `docs/funding-app-progress-spec.md`.
- `supabase-setup.sql` — the canonical, re-runnable schema.
- `migrations/` — one-off SQL for projects converted from the old Auto 1
  Dispatch schema. Never needed on a fresh project.
- After any deploy the user may need to hard-refresh / reopen the PWA.
- Before pushing: `npx tsc --noEmit && npm run build`.

## Approvals are server-side — keep them that way

RLS decides **who** can write a `work_orders` row; it cannot decide **which
columns**. Every status move therefore goes through
`app/api/work-orders/[id]/approve/route.ts`, which checks the caller's role and
writes only that role's own approval columns with the service-role client.

When adding anything to the approval chain:
- Never let the browser set `status`, `*_approved_by`, `*_approved_at`, or the
  `qb_*` columns directly — `pickEditable()` in `lib/work-orders.ts` is the
  allowlist for what a client may write.
- Nobody approves a ticket they submitted; a contractor only touches their own
  crews' tickets.

## Admin-only boundaries (owner's rules — keep them)

"Admin" means `admin` or `master_admin` (`is_admin()`); `office` is not admin.
Each rule is enforced server-side (route check and/or RLS), never only in UI:

- **Invoices**: edit, void, re-attach PDFs — admin-only QuickBooks routes.
  Field staff may update an `orders` row only in its delivery columns
  (`guard_order_columns` trigger); everything else on an order is admin.
- **Tickets**: office reviews, edits, approves, invoices; **deleting** a
  ticket is admin only (plus a crew member's own unsubmitted draft).
- **Hours / time clock**: employees clock themselves via
  `/api/time-clock/self` and may log `hours` rows; only an admin edits or
  deletes hours, edits or deletes clock sessions, or clocks someone else in
  or out (`time_clock own` is select-only).
- **Users**: adding users, setting roles, resetting passwords — admin routes.
  The one exception is a hauling company adding its own drivers via
  `/api/haulers/drivers`. Public sign-up must stay OFF in Supabase Auth.
- **Money**: customer rates and hauler pay rates are office + admin; haulers
  never read `job_orders`. There is no employee pay data in this app.

## Money is recomputed, never trusted

Hours come from `start_at`/`stop_at` plus travel and down time; the amount is
that (or tonnage, on a tonnage job) × the ticket's rate. The client shows the
math live, but `lib/work-orders.ts` recomputes it server-side before invoicing.
Don't add a code path that bills a number posted from the browser.

## QuickBooks

- `lib/quickbooks.ts` holds OAuth + the invoice primitives; `lib/work-orders.ts`
  builds the work-order invoice; `lib/quickbooks-invoice.ts` handles the
  customer-order (shop) invoice.
- The item every ticket bills against is an `app_settings` key
  (`work_order_qb_item_id`), picked on **Work Orders → Setup**.
- A failed QuickBooks call must never roll back an approval — leave the ticket
  approved and let the office retry the invoice.
