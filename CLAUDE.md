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
- The haul ticket follows the dispatch spec: one driver's day on one job,
  on one ticket. `components/WorkOrderForm.tsx` has two layouts. Crews
  (driver, mechanic, labor, hauler side) always get the **driver view**;
  office and admin get the full form with a toggle.
  - **Start now, pick the job later.** A ticket can be started, stamped and
    photographed with no job. The job picker (top of the ticket, amber when
    blank) lists orders running on the ticket's day (`runsOn`), refreshes when
    the driver returns to the app, and saves at once. The job is required to
    finish. Once a ticket is in, only the office moves it to another job.
  - **The server owns the job's facts** (`lib/ticket-rules.ts`): on a Bone
    crew ticket the job number, addresses, rate, rate unit, travel and
    minimum hours are written from the order (`jobFacts`), never from the
    request, and the pick is checked (`jobPickProblem`: open, date in range).
  - **One open ticket a day**: a Bone crew POST that finds their draft for
    that date returns it instead of making another.
  - **Loads**: four taps each (time saved at once, GPS after), a BOL photo
    per load (`ScanButton` kind `bol` reads ticket number and net tons),
    Undo by tapping a stamp, **Edit times** to type them (marked ✎ in
    `work_order_loads.typed_stamps`, in order, no GPS).
  - **Paper copy** (`work_orders.paper`): photos of the paper ticket
    (`ticket_photo_path`, `short_ticket_path`) plus typed totals
    (`ticket_number`, `paper_hours`, `paper_loads`, `tonnage`) instead of
    stamps. Offered on the Start screen and while no load is stamped.
  - **Finish day** is refused (`finishProblem`, client and PATCH route)
    unless: a job is picked; at least one load with a Load in and an Unload
    out, or on paper one photo; every load has its BOL photo. The foreman's
    signature is optional to finish; the audit flags a ticket without one.
    On a crew submit the route re-derives start/stop from the loads.
  - **Hours**: `truckHours` (first Load in → last Unload out, or the paper's
    typed hours) − down time + travel + extra (`totalHours`); an hourly job
    bills at least the order's `min_hours` (`billableHours`).
  - **Ticket number**: `work_orders.ticket_no` from a sequence, shown as
    `HT-<n>` (`ticketLabel`). `ticket_number` is the paper pad's own number.
  - **PDF**: the ticket page, then the BOL photos six to a page captioned
    "Load N – Ticket #…" (or the paper photos, one a page).
  - **Audit** (`components/AuditQueue.tsx`): `loadFlags` marks loads missing
    a time or a BOL photo, and typed times.
  - **Reminders** (`lib/ticket-reminders.ts`): `/api/cron/ticket-reminders`
    runs hourly; 6–11 PM yard time (America/Denver) every started open
    ticket gets a push, and at 6 AM the ones left overnight. The office's
    "Remind now" is `/api/work-orders/[id]/remind`. `FinishTicketReminder`
    is the full-screen prompt in the crew layouts.
  - **Orders stay open until the office closes them** — the owner's
    exception to the spec. Nothing auto-completes an order; don't add it.
- Dispatch to Bone's own drivers: the order page's "Send to Bone drivers"
  (`components/AssignDrivers.tsx`) posts to `/api/job-orders/[id]/assign`,
  office/admin only, which makes one draft ticket per driver from the order
  (`submitted_by` and `assigned_to` = the driver, so it's theirs), skips a
  driver already on that order that day, and sends a bell notification and a
  push. Only Bone's active driver/mechanic logins (no `hauler_id`) can be
  picked. Taking a job back deletes the untouched draft, so it is admin only.
  Lessors still get orders through hauler loads.
  The send carries a start time (`work_orders.report_time`, per driver or
  for the whole send, shown on the driver's home card, ticket and push) and
  the job's travel time, which is saved back to the order.
- Travel vs waiting: `travel_hours` is the office's number per job (order →
  ticket); a crew member can't change it on a ticket that has an order (both
  work-order routes enforce it). The driver's waiting time is `extra_hours`.
  `totalHours` = truck hours − down + travel + extra.
- Live progress to the funding app: `sendTicketProgress` in `lib/factoring.ts`
  posts an in-progress preview of a ticket to `{base}/progress` — only for a
  hauler whose link is `linked`, only while the ticket is open, only when
  something changed. Pinged from the form and the load lines, swept every
  five minutes by `/api/cron/factoring-progress`. Contract:
  `docs/funding-app-progress-spec.md`.
- Place check: `runPlaceCheck` in `lib/place-check.ts` measures every load
  stamp's GPS fix against the job's pit (order `pickup_address`) and site
  (`dropoff_address` or `job_address`), within `PLACE_RADIUS_M` (800 m,
  overridable via app_settings `place_check_radius_m`), and stores the result
  in `work_orders.place_check`. Runs after each stamp and each save; the audit
  flags any `off` stamp and any ticket with no fixes. Addresses are geocoded
  once into `geocode_cache` by `lib/geocode.ts` (Nominatim, then US Census;
  keyless). It never blocks a save, submit or approval.
- Fleet tab (`app/fleet`): Bone's own fleet program, built in-app with its
  own tables (`fleet_vehicles`, `fleet_trips`, `fleet_fuel`,
  `fleet_maintenance`, `fleet_documents`; files in the `fleet-docs` bucket).
  Trucks → trips with odometer and miles by state → fuel by state → the IFTA
  quarter summary (`iftaSummary` in `lib/fleet.ts`). Bone staff only
  (`is_bone_staff()`): drivers log their own trips and fuel, office/admin
  edit everything, only admin deletes. Lessors' logins never see it.
  Scanning: `/api/fleet/scan` reads a photo already in `fleet-docs`
  (registration card, fuel receipt, shop bill) with Claude vision and returns
  the fields in `lib/fleet-scan.ts`; `components/ScanButton.tsx` uploads,
  calls it and hands the form the fields plus the photo's path. Needs
  `ANTHROPIC_API_KEY` on Vercel; without it the button explains and the
  forms still work by hand. The scan is a suggestion, never a save.
- The user guide is `public/user-guide.md`: served in-app at `/help` (the
  nav's ? links to the role's section by heading slug) and the source of the
  PDF. Keep it in step with features.
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
  never read `job_orders` — nor do their drivers (role `driver` with a
  `hauler_id`); the read policy requires `my_hauler_id() is null`. The one window is `/api/haulers/loads/[id]/order`,
  which hands a hauler its own load's job details with `rate` and
  `fuel_surcharge` left out (keep that column list closed). There is no
  employee pay data in this app.

## Money is recomputed, never trusted

Hours come from `start_at`/`stop_at` (or a paper copy's typed hours), less down
time, plus travel and time waited, with the job's minimum on an hourly job;
the amount is that (or tonnage, loads, or the day) × the ticket's rate. On a
Bone crew ticket the rate itself is written from the order by the server. The client shows the
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
