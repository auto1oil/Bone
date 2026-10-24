# Connecting an app to the Auto 1 Funding (QuickPay factoring) app — reference hand-off

Source: the Stallion Tank field-ticket app (Next.js 14 App Router + Supabase). This is
the complete, working integration with the funding app at
`https://quickpay-factoring.vercel.app` — contract, server code, schema, and UI gating —
for an agent wiring a second app to the same funding service.

## Read this first — what the new app must do differently

1. **Its own identity.** Every payload carries `source: 'stallion-tank'`. The new app
   must send its own source string, and the funding app's admin must issue it its OWN
   endpoints + API key (the funding side keys borrower matching and auth per source).
   Coordinate with the funding app's agent: "same contract as stallion-tank, new source
   `<your-app>`, issue a key" is the entire ask.
2. **The API key lives server-side only.** It's stored in an admin-only settings table
   and used from server routes. It must never reach a browser bundle.
3. **Nothing ever blocks on the funding app.** Approvals, ticket saves, and completions
   go through even when the funding app is down; failures are recorded on the row and
   retried with a button. The ONE exception is deliberate: completing a factor-pay
   ticket requires the signed bill of sale — and even that waives itself if the funding
   app is unreachable (a signature requirement must not hinge on someone else's uptime).
4. **Everything is idempotent per ticket id.** Re-POSTs update, never duplicate.

## The HTTP contract (all POST, `Authorization: Bearer <key>`, JSON)

One configured base URL ending in `/tickets`; siblings are derived from it:
`.../tickets`, `.../bill-of-sale`, `.../link-request`, `.../link-status`.

### Shared ticket payload (sent to tickets AND bill-of-sale)

```json
{
  "source": "stallion-tank",
  "ticket_id": "uuid — the dedupe/idempotency key",
  "hauler_id": "uuid — funding app matches borrowers by this first, name fallback",
  "supervisor_name": "typed name from the foreman signature, or null",
  "supervisor_signed_at": "ISO timestamp of that signature, or null",
  "ticket_number": "...", "job_number": "...", "job_name": "...",
  "job_date": "YYYY-MM-DD", "phase_code": "...",
  "hauler": "company name", "driver": "...", "unit_number": "...",
  "quantity": 9.5, "unit": "hrs", "rate": 145.0, "amount": 1377.5,
  "hours": 9.5, "loads": 5, "tons": 126.5
}
```

`amount` is what the HAULER is owed (their pay rate × their quantity) — the customer's
rate never leaves the ticket app.

### 1. Account link — the per-company on/off switch (funding side owns it)

- `POST {base}/link-request` — the hauler asking to link. Body: `{source, hauler_id,
  name, mc_number, dot_number, contact_name, email, phone}`.
  Answer: `{ok: true, status: "pending"}` (lands on the funding admin's approval queue).
- `POST {base}/link-status` — asked live at every moment that matters. Body:
  `{source, hauler_id}`. Answer: `{ok: true, status: "none"|"pending"|"linked"|"off"}`
  (the funding app may say `"approved"` and/or `approved: true` — normalize to linked).
  The admin can flip linked/off at ANY time; honor whatever this returns. Only linked
  shows the Factor Payment button; a posted 'factor' from an unlinked company is
  silently downgraded to standard.

### 2. Bill of sale — signed at Factor-Payment time

- `POST {base}/bill-of-sale` — the shared payload + `status: "factor_payment_selected"`.
  Answer: `{ok, id, url, accepted, accepted_by, accepted_at}`.
  Open `url` for the hauler; they sign by typing their name over there. Idempotent per
  ticket: re-POST to poll acceptance or to refresh the document after amounts change.
  Completion requires `accepted` AND `accepted_at` newer than any office send-back
  (the ticket stamps `bos_reset_at` on rejection — old signatures stop counting
  because the numbers changed under them).

### 3. Approved ticket — the hand-off that creates the fundable deal

- `POST {base}/tickets` — the shared payload + `status: "approved_ready_to_fund"`,
  `approved_at`, `qb_invoice_number`, `ticket_pdf_url` (signed link, 7-day TTL).
  Any 2xx within 15s = acknowledged. The funding app promotes the signed bill of sale
  to a deal (or creates one), funds it, and invoices the sender back itself.

### Errors (both bill-of-sale and tickets)

- `403` + `{"status": "none"|"pending"|"off"}` — the company isn't linked. Record it in
  plain words, cache the status so the button disappears, never block the ticket.
- `401` bad key · `400` bad body · `503` not configured · timeouts: record + retry
  later; 5xx/unreachable counts as "couldn't ask", not "no".

## Configuration (admin settings, master-only)

Two keys in an admin settings table: the endpoint URL (must end in `/tickets`) and the
API key. In Stallion they're `factoring_webhook_url` / `factoring_api_key` in
`app_settings`, readable/writable ONLY by the master admin via RLS; the server reads
them with the service role:

```sql
drop policy if exists "Admins manage app_settings" on public.app_settings;
create policy "Admins manage app_settings" on public.app_settings
  for all to authenticated
  using (public.is_admin()
    and key not in ('factoring_webhook_url', 'factoring_api_key'))
  with check (public.is_admin()
    and key not in ('factoring_webhook_url', 'factoring_api_key'));

drop policy if exists "Master admin manages factoring settings" on public.app_settings;
create policy "Master admin manages factoring settings" on public.app_settings
  for all to authenticated
  using (public.is_master_admin()
    and key in ('factoring_webhook_url', 'factoring_api_key'))
  with check (public.is_master_admin()
    and key in ('factoring_webhook_url', 'factoring_api_key'));
```

## Schema the integration hangs off

```sql
-- On the ticket:
payment_method text check (payment_method is null or payment_method in ('standard','factor')),
factor_sent_at timestamptz,   -- when the tickets hand-off landed
factor_error   text,          -- why it didn't; error with no sent_at = the retry queue
bos_reset_at   timestamptz,   -- office send-back: older bill-of-sale signatures stop counting
ticket_pdf_path text,         -- generated ticket PDF referenced by ticket_pdf_url
foreman_signature_name text,  -- -> supervisor_name
foreman_signature_signed_at timestamptz,  -- -> supervisor_signed_at

-- On the company (cache of the funding app's last link answer; truth lives there):
alter table public.haulers add column if not exists factoring_link_status text not null default 'none'
  check (factoring_link_status in ('none', 'pending', 'linked', 'off'));
alter table public.haulers add column if not exists factoring_link_requested_at timestamptz;
alter table public.haulers add column if not exists factoring_link_checked_at   timestamptz;

-- RLS gates rows, not columns — a trigger stops the company granting itself the link:
create or replace function public.guard_hauler_active()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_user = 'service_role' then
    return new;
  end if;
  if (new.active is distinct from old.active
      or new.factoring_link_status is distinct from old.factoring_link_status
      or new.factoring_link_requested_at is distinct from old.factoring_link_requested_at
      or new.factoring_link_checked_at is distinct from old.factoring_link_checked_at)
     and not (public.is_admin() or public.has_role(array['office'])) then
    raise exception 'that column on a hauling company is not the company''s to set';
  end if;
  return new;
end;
$$;
```

---

## lib/factoring.ts — the complete integration library

Config read, shared payload builder, approved-ticket hand-off (with caching of
sent-at/error on the row), bill of sale, link request/status with the
approved→linked normalization and the 403 gate handling.

```ts
// The factoring hand-off.
//
// A hauler can choose to have a ticket factored instead of waiting on
// Stallion's pay run. Once the office approves such a ticket, it is POSTed to
// the factoring service as "approved and ready to fund"; from there the
// factoring app runs the job and invoices Stallion itself.
//
// The connection is a webhook: an admin pastes the factoring app's endpoint
// (and an API key, if it wants one) under Work Orders → Setup. Until that's
// configured, factor-marked tickets simply record why they weren't sent, and
// every approval still succeeds — the hand-off must never block an approval,
// exactly like a failed QuickBooks call.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  billableQuantity, billableUnit, totalHours, totalLoadTons, countLoads,
  type WorkOrder, type WorkOrderLoad,
} from '@/lib/work-orders';
import { ensureTicketPdf } from '@/lib/ticket-pdf';

export const FACTORING_URL_KEY = 'factoring_webhook_url';
export const FACTORING_KEY_KEY = 'factoring_api_key';

export async function getFactoringConfig(
  db: SupabaseClient,
): Promise<{ url: string; apiKey: string } | null> {
  const { data } = await db
    .from('app_settings')
    .select('key, value')
    .in('key', [FACTORING_URL_KEY, FACTORING_KEY_KEY]);
  const m = new Map(((data as { key: string; value: string }[]) || []).map((r) => [r.key, r.value]));
  const url = (m.get(FACTORING_URL_KEY) || '').trim();
  if (!url) return null;
  return { url, apiKey: (m.get(FACTORING_KEY_KEY) || '').trim() };
}

// One payload shape for both factoring calls — the approved-ticket webhook
// and the bill of sale render from the same fields.
async function buildTicketPayload(db: SupabaseClient, wo: WorkOrder) {
  const { data: loadRows } = await db
    .from('work_order_loads').select('*').eq('work_order_id', wo.id)
    .order('load_no');
  const loads = (loadRows as WorkOrderLoad[]) || [];

  let haulerName: string | null = null;
  if (wo.hauler_id) {
    const { data: h } = await db
      .from('haulers').select('name').eq('id', wo.hauler_id).maybeSingle();
    haulerName = (h as { name: string } | null)?.name ?? null;
  }

  // What the HAULER is owed — their own rate on their own quantity. The
  // customer side of the ticket is none of the factoring app's business.
  const qty = billableQuantity(wo, loads);
  const rate = Number(wo.rate || 0);
  const amount = Math.round(qty * rate * 100) / 100;

  return {
    loads,
    payload: {
      source: 'stallion-tank',
      ticket_id: wo.id,
      // Haulers are matched by this id on the factoring side (name is their
      // fallback), and it's what their 403 gate keys on.
      hauler_id: wo.hauler_id,
      // The supervisor/foreman's typed sign-off, displayed on the deal.
      supervisor_name: wo.foreman_signature_name,
      supervisor_signed_at: wo.foreman_signature_signed_at,
      ticket_number: wo.ticket_number,
      job_number: wo.job_number,
      job_name: wo.job_name,
      job_date: wo.job_date,
      phase_code: wo.phase_code,
      hauler: haulerName || wo.trucking_company,
      driver: wo.driver_name,
      unit_number: wo.unit_number,
      quantity: qty,
      unit: billableUnit(wo, loads),
      rate,
      amount,
      hours: totalHours(wo),
      loads: countLoads(loads),
      tons: totalLoadTons(loads),
    },
  };
}

async function postToFactoring(
  url: string,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---- The Auto 1 Funding account link ---------------------------------------
// Only a hauler with an approved account in the factoring app may Factor
// Payments. The link is requested from Stallion, approved by the factoring
// app's admin, and can be switched off over there at any time — so the truth
// lives there, Stallion caches the last answer on the haulers row, and the
// enforcement points ask live.

export type FactoringLinkStatus = 'none' | 'pending' | 'linked' | 'off';

// The factoring endpoints live side by side: .../tickets, .../bill-of-sale,
// .../link-request, .../link-status.
function siblingEndpoint(ticketsUrl: string, name: string): string | null {
  if (!/\/tickets\/?$/.test(ticketsUrl)) return null;
  return ticketsUrl.replace(/\/tickets\/?$/, `/${name}`);
}

// The factoring app says 'approved' where Stallion says 'linked' — accept
// either wording, plus their bare approved flag.
function normalizeLinkStatus(body: { status?: string; approved?: boolean } | null): FactoringLinkStatus | null {
  if (!body) return null;
  const s = body.status === 'approved' ? 'linked' : body.status;
  if (s && ['none', 'pending', 'linked', 'off'].includes(s)) return s as FactoringLinkStatus;
  if (body.approved === true) return 'linked';
  return null;
}

// Their tickets/bill-of-sale endpoints answer 403 with { status } when the
// hauler isn't approved. Turn that into words a person can act on.
function linkGateMessage(status: string | undefined): string {
  if (status === 'pending') return 'Auto 1 Funding hasn’t approved this company’s link yet';
  if (status === 'off') return 'this company’s Auto 1 Funding link is switched off';
  return 'this company’s Auto 1 Funding account isn’t linked';
}

async function cacheLinkStatus(db: SupabaseClient, haulerId: string, status: FactoringLinkStatus, requested = false) {
  const now = new Date().toISOString();
  await db.from('haulers').update({
    factoring_link_status: status,
    factoring_link_checked_at: now,
    ...(requested ? { factoring_link_requested_at: now } : {}),
  }).eq('id', haulerId);
}

// The hauler asks to link their Auto 1 Funding account; the request lands on
// the factoring app's admin queue.
export async function requestFactoringLink(
  db: SupabaseClient,
  haulerId: string,
): Promise<{ ok: boolean; status?: FactoringLinkStatus; error?: string }> {
  try {
    const { data: h } = await db.from('haulers').select('*').eq('id', haulerId).maybeSingle();
    if (!h) return { ok: false, error: 'company not found' };
    const config = await getFactoringConfig(db);
    if (!config) return { ok: false, error: 'the factoring app isn’t connected yet — ask Stallion' };
    const url = siblingEndpoint(config.url, 'link-request');
    if (!url) return { ok: false, error: 'the factoring endpoint URL should end in /tickets — ask Stallion to fix it' };

    const hauler = h as { name: string; mc_number: string | null; dot_number: string | null; contact_name: string | null; email: string | null; phone: string | null };
    const res = await postToFactoring(url, config.apiKey, {
      source: 'stallion-tank',
      hauler_id: haulerId,
      name: hauler.name,
      mc_number: hauler.mc_number,
      dot_number: hauler.dot_number,
      contact_name: hauler.contact_name,
      email: hauler.email,
      phone: hauler.phone,
    });
    if (!res.ok) return { ok: false, error: `factoring app answered ${res.status}` };
    const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: string; approved?: boolean } | null;
    if (!body?.ok) return { ok: false, error: 'the factoring app did not take the request' };
    const status = normalizeLinkStatus(body) || 'pending';
    await cacheLinkStatus(db, haulerId, status, true);
    return { ok: true, status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'could not reach the factoring app' };
  }
}

// Ask the factoring app where the link stands right now. Falls back to the
// cached answer when they can't be reached, and says so.
export async function checkFactoringLink(
  db: SupabaseClient,
  haulerId: string,
): Promise<{ ok: boolean; status: FactoringLinkStatus; live: boolean; error?: string }> {
  const cached = async (): Promise<FactoringLinkStatus> => {
    const { data: h } = await db.from('haulers')
      .select('factoring_link_status').eq('id', haulerId).maybeSingle();
    const s = (h as { factoring_link_status: string | null } | null)?.factoring_link_status;
    return (['none', 'pending', 'linked', 'off'].includes(s || '') ? s : 'none') as FactoringLinkStatus;
  };
  try {
    const config = await getFactoringConfig(db);
    const url = config ? siblingEndpoint(config.url, 'link-status') : null;
    if (!config || !url) return { ok: true, status: await cached(), live: false, error: 'factoring app not connected' };

    const res = await postToFactoring(url, config.apiKey, {
      source: 'stallion-tank',
      hauler_id: haulerId,
    });
    if (!res.ok) return { ok: true, status: await cached(), live: false, error: `factoring app answered ${res.status}` };
    const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: string; approved?: boolean } | null;
    const status = body?.ok ? normalizeLinkStatus(body) : null;
    if (!status) {
      return { ok: true, status: await cached(), live: false, error: 'unreadable answer from the factoring app' };
    }
    await cacheLinkStatus(db, haulerId, status);
    return { ok: true, status, live: true };
  } catch (err) {
    return {
      ok: true, status: await cached(), live: false,
      error: err instanceof Error ? err.message : 'could not reach the factoring app',
    };
  }
}

export type BillOfSale = {
  ok: boolean;
  url?: string;
  accepted?: boolean;
  accepted_by?: string | null;
  accepted_at?: string | null;
  // 'unreachable' means the factoring app couldn't answer — callers decide
  // whether that blocks anything (completion doesn't wait on their uptime).
  error?: string;
  unreachable?: boolean;
};

// Ask the factoring app for this ticket's bill of sale. Idempotent per
// ticket: the same URL comes back with current acceptance state, and a
// re-POST after the ticket's numbers change refreshes the document.
export async function requestBillOfSale(
  db: SupabaseClient,
  workOrderId: string,
): Promise<BillOfSale> {
  try {
    const { data: row } = await db
      .from('work_orders').select('*').eq('id', workOrderId).maybeSingle();
    if (!row) return { ok: false, error: 'ticket not found' };
    const wo = row as WorkOrder;

    const config = await getFactoringConfig(db);
    if (!config) {
      return { ok: false, unreachable: true, error: 'factoring app not connected — set the endpoint under Work Orders → Setup' };
    }
    // The configured endpoint is the tickets webhook; the bill of sale lives
    // beside it. Refuse loudly if the URL doesn't follow that shape rather
    // than POSTing tickets at a guessed address.
    if (!/\/tickets\/?$/.test(config.url)) {
      return { ok: false, unreachable: true, error: 'the factoring endpoint URL should end in /tickets — fix it under Work Orders → Setup' };
    }
    const bosUrl = config.url.replace(/\/tickets\/?$/, '/bill-of-sale');

    const { payload } = await buildTicketPayload(db, wo);
    const res = await postToFactoring(bosUrl, config.apiKey, {
      ...payload,
      status: 'factor_payment_selected',
    });
    // 403 is their link gate — the hauler isn't approved (or was switched
    // off). Cache the answer so the Factor button disappears too.
    if (res.status === 403) {
      const gate = (await res.json().catch(() => null)) as { status?: string } | null;
      const s = normalizeLinkStatus(gate ? { status: gate.status } : null);
      if (s && wo.hauler_id) await cacheLinkStatus(db, wo.hauler_id, s);
      return { ok: false, error: linkGateMessage(gate?.status) };
    }
    if (!res.ok) {
      return { ok: false, unreachable: res.status >= 500, error: `factoring app answered ${res.status}` };
    }
    const body = (await res.json().catch(() => null)) as
      { ok?: boolean; url?: string; accepted?: boolean; accepted_by?: string | null; accepted_at?: string | null } | null;
    if (!body?.ok || !body.url) {
      return { ok: false, error: 'the factoring app did not return a bill of sale' };
    }
    return {
      ok: true,
      url: body.url,
      accepted: !!body.accepted,
      accepted_by: body.accepted_by ?? null,
      accepted_at: body.accepted_at ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      unreachable: true,
      error: err instanceof Error ? err.message : 'could not reach the factoring app',
    };
  }
}

// Send one approved, factor-marked ticket. Records the outcome on the row
// either way: factor_sent_at on success, factor_error on failure — an error
// with no sent-at is the retry queue.
export async function sendTicketToFactoring(
  db: SupabaseClient,
  workOrderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const fail = async (reason: string) => {
    await db.from('work_orders')
      .update({ factor_error: reason })
      .eq('id', workOrderId);
    return { ok: false, error: reason };
  };

  try {
    const { data: row } = await db
      .from('work_orders').select('*').eq('id', workOrderId).maybeSingle();
    if (!row) return { ok: false, error: 'ticket not found' };
    const wo = row as WorkOrder;
    if (wo.payment_method !== 'factor') {
      return { ok: false, error: 'ticket is not marked for factoring' };
    }
    if (wo.factor_sent_at) return { ok: true };

    const config = await getFactoringConfig(db);
    if (!config) {
      return fail('factoring app not connected — set the endpoint under Work Orders → Setup');
    }

    // A fresh signed link to the ticket PDF. Generated here if invoicing
    // hasn't already done it (e.g. the office approved without invoicing). A
    // week gives their intake queue time without making the link permanent.
    let pdfPath = wo.ticket_pdf_path;
    if (!pdfPath) {
      const made = await ensureTicketPdf(db, wo.id);
      pdfPath = made?.path ?? null;
    }
    let pdfUrl: string | null = null;
    if (pdfPath) {
      const { data: signed } = await db.storage
        .from('work-tickets').createSignedUrl(pdfPath, 7 * 24 * 3600);
      pdfUrl = signed?.signedUrl ?? null;
    }

    const { payload } = await buildTicketPayload(db, wo);
    const res = await postToFactoring(config.url, config.apiKey, {
      ...payload,
      status: 'approved_ready_to_fund',
      approved_at: wo.office_approved_at,
      qb_invoice_number: wo.qb_invoice_number,
      ticket_pdf_url: pdfUrl,
    });
    // Their link gate: not approved (or switched off) over there. Recorded
    // like any other factor_error — the approval itself always stands.
    if (res.status === 403) {
      const gate = (await res.json().catch(() => null)) as { status?: string } | null;
      const s = normalizeLinkStatus(gate ? { status: gate.status } : null);
      if (s && wo.hauler_id) await cacheLinkStatus(db, wo.hauler_id, s);
      return fail(linkGateMessage(gate?.status));
    }
    if (!res.ok) {
      return fail(`factoring app answered ${res.status}`);
    }

    await db.from('work_orders')
      .update({ factor_sent_at: new Date().toISOString(), factor_error: null })
      .eq('id', workOrderId);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'could not reach the factoring app');
  }
}
```

---

## app/api/haulers/factoring-link/route.ts — link request + live status

GET = live status for the caller's company (staff may ask about any company);
POST = the company login requesting the link. The key never reaches the browser.

```ts
// GET  /api/haulers/factoring-link — where the caller's company's Auto 1
//        Funding link stands (asked live; falls back to the cached answer).
// POST /api/haulers/factoring-link — request the link. Company login only;
//        the request lands on the factoring app's admin queue.
//
// Server-side because the factoring API key never reaches a browser, and
// because the cached status columns on haulers are guarded against the
// company writing them itself.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requestFactoringLink, checkFactoringLink } from '@/lib/factoring';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function resolveHauler(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 }) };
  const { data: actor } = await supabase
    .from('profiles').select('role, hauler_id').eq('id', user.id).single();

  // Staff may look at any company (?hauler_id=…); a hauler-side login is
  // pinned to its own.
  const url = new URL(req.url);
  const asked = url.searchParams.get('hauler_id');
  const isStaff = ['office', 'admin', 'master_admin'].includes(actor?.role || '');
  const haulerId = actor?.hauler_id || (isStaff ? asked : null);
  if (!haulerId) {
    return { error: NextResponse.json({ ok: false, error: 'no hauling company on this login' }, { status: 403 }) };
  }
  return { haulerId, role: actor?.role || '', ownCompany: !!actor?.hauler_id };
}

export async function GET(req: Request) {
  const r = await resolveHauler(req);
  if ('error' in r) return r.error;
  const db = createAdminClient();
  const result = await checkFactoringLink(db, r.haulerId!);
  return NextResponse.json({ ok: true, status: result.status, live: result.live, note: result.error || null });
}

export async function POST(req: Request) {
  const r = await resolveHauler(req);
  if ('error' in r) return r.error;
  // The company login owns the request — a driver doesn't sign the company
  // up for factoring, and staff don't request on a company's behalf.
  if (r.role !== 'hauler') {
    return NextResponse.json({ ok: false, error: 'only the company login can request the link' }, { status: 403 });
  }
  const db = createAdminClient();
  const result = await requestFactoringLink(db, r.haulerId!);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, status: result.status });
}
```

---

## app/api/work-orders/[id]/bill-of-sale/route.ts — fetch/refresh the document

```ts
// POST /api/work-orders/[id]/bill-of-sale — get (or refresh) the factoring
// app's bill of sale for a factor-pay ticket.
//
// The factoring app renders the document and the hauler signs it there; this
// route exists because the API key lives server-side, never in the browser.
// Idempotent: the same ticket always gets the same URL back, along with the
// current acceptance state, so the form can re-call it to poll for the
// signature.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requestBillOfSale } from '@/lib/factoring';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase
    .from('profiles').select('role, hauler_id').eq('id', user.id).single();

  const db = createAdminClient();
  const { data: wo } = await db
    .from('work_orders')
    .select('id, hauler_id, submitted_by, assigned_to')
    .eq('id', params.id)
    .maybeSingle();
  if (!wo) return NextResponse.json({ ok: false, error: 'work order not found' }, { status: 404 });

  // The hauler's own people (it's their document to sign) and the office.
  const row = wo as { hauler_id: string | null; submitted_by: string | null; assigned_to: string | null };
  const isStaff = ['office', 'admin', 'master_admin'].includes(actor?.role || '');
  const isTheirs = !!actor?.hauler_id && actor.hauler_id === row.hauler_id;
  if (!isStaff && !isTheirs) {
    return NextResponse.json({ ok: false, error: 'not your ticket' }, { status: 403 });
  }

  const result = await requestBillOfSale(db, params.id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || 'could not get the bill of sale', unreachable: !!result.unreachable },
      { status: result.unreachable ? 502 : 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    url: result.url,
    accepted: result.accepted,
    accepted_by: result.accepted_by,
    accepted_at: result.accepted_at,
  });
}
```

---

## app/api/work-orders/[id]/factor/route.ts — office retry for a failed hand-off

```ts
// POST /api/work-orders/[id]/factor — resend an approved factor-pay ticket to
// the factoring app. Office/admin only.
//
// Approval normally does this in one step; this is the retry for when the
// factoring app was down, unreachable, or not yet connected at that moment.
// The same idempotency rule applies: a ticket that already went through is
// reported as sent, not sent twice.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendTicketToFactoring } from '@/lib/factoring';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!actor || !['office', 'admin', 'master_admin'].includes(actor.role)) {
    return NextResponse.json({ ok: false, error: 'office only' }, { status: 403 });
  }

  const db = createAdminClient();
  const { data: wo } = await db
    .from('work_orders')
    .select('id, payment_method, office_approved_at, factor_sent_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!wo) return NextResponse.json({ ok: false, error: 'work order not found' }, { status: 404 });

  const row = wo as { payment_method: string | null; office_approved_at: string | null; factor_sent_at: string | null };
  if (row.payment_method !== 'factor') {
    return NextResponse.json({ ok: false, error: 'this ticket is standard pay, not factored' }, { status: 400 });
  }
  // "Approved and ready to fund" has to be true before it's said to anyone.
  if (!row.office_approved_at) {
    return NextResponse.json({ ok: false, error: 'approve the ticket before sending it to factoring' }, { status: 400 });
  }

  const result = await sendTicketToFactoring(db, params.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || 'factoring hand-off failed' }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    already_sent: !!row.factor_sent_at,
  });
}
```

---

## Where the integration hooks into the app's own flows (excerpts)

### Approval route — the hand-off fires AFTER approval, never blocking it

```ts
// After the office approval is written (and the customer invoice attempted):
let factorError: string | null = null;
if (as === 'office' && (updated as WorkOrder).payment_method === 'factor') {
  const sent = await sendTicketToFactoring(db, wo.id);
  if (!sent.ok) factorError = sent.error || 'factoring hand-off failed';
}

// And rejection (send-back) of a factor ticket invalidates the old signature:
const { data: updated, error } = await db
  .from('work_orders')
  .update({
    status: 'rejected',
    rejected_reason: reason,
    ...(wo.payment_method === 'factor' ? { bos_reset_at: now } : {}),
  })
  .eq('id', wo.id).select('*').single();
```

### Ticket save route — the live gate and the signed-BOS completion requirement

```ts
// A hauler-side write of 'factor' is checked live, not against the button
// that happened to be on screen:
if (patch.payment_method === 'factor' && actor?.hauler_id) {
  const link = await checkFactoringLink(createAdminClient(), actor.hauler_id);
  if (link.status !== 'linked') patch.payment_method = 'standard';
}

// Completing a factor ticket requires a signature NEWER than any send-back.
// Runs AFTER the save so the re-POSTed document reflects the saved numbers;
// an unsigned one reverts the status, keeps every field, and hands the
// signing link back to the form. bos.ok false (unreachable) waives the gate.
if (body.submit === true && actor?.hauler_id
    && (data as { payment_method: string | null }).payment_method === 'factor') {
  const admin = createAdminClient();
  const bos = await requestBillOfSale(admin, params.id);
  const resetAt = (data as { bos_reset_at: string | null }).bos_reset_at;
  const signatureCounts = !!bos.accepted
    && (!resetAt || (!!bos.accepted_at && new Date(bos.accepted_at) > new Date(resetAt)));
  if (bos.ok && !signatureCounts) {
    await admin.from('work_orders')
      .update({ status: before?.status || 'draft', submitted_at: before?.submitted_at || null })
      .eq('id', params.id);
    return NextResponse.json({
      ok: false,
      error: bos.accepted
        ? 'The office sent this ticket back, so the amounts changed — the new bill of sale needs to be signed again before completing.'
        : 'Everything is saved, but a Factor Payment ticket needs the signed bill of sale before it can be completed.',
      bill_of_sale_url: bos.url,
    }, { status: 400 });
  }
}
```

### Ticket form — button gating and the sign panel

```tsx
// On load (hauler-side users): ask the server, which asks the funding app live.
const res = await fetch('/api/haulers/factoring-link', { cache: 'no-store' });
const json = await res.json();
setFactorAllowed(json.ok && json.status === 'linked');

// Render: no link, no button. Just Standard Pay plus a pointer to the
// company settings page where the link is requested.
{(factorAllowed
  ? [['standard', 'Standard Pay'], ['factor', 'Factor Payment']]
  : [['standard', 'Standard Pay']]
).map(...)}

// Posted payload: a stale 'factor' quietly downgrades (server re-checks anyway).
payment_method: draft.payment_method === 'factor' && isHauler && !factorAllowed
  ? 'standard'
  : (draft.payment_method || (isHauler ? 'standard' : null)),

// Picking Factor fetches the bill of sale via POST /api/.../bill-of-sale and
// shows a sign panel: "Open & sign" opens the returned url in a tab opened
// BEFORE the await (Safari blocks window.open after one); a window-focus
// listener re-polls so the green "signed by NAME at TIME" strip appears when
// they come back from signing; a signature with accepted_at <= bos_reset_at
// renders the "office sent this back — sign the refreshed document" state.
```

### Company settings page — the link card

```tsx
// GET /api/haulers/factoring-link on load; then one of three states:
//  linked  -> green "account linked - Factor Payment is available"
//  pending -> amber "waiting on approval"
//  none/off-> explainer + [Link Auto 1 Funding account] button that
//             POSTs /api/haulers/factoring-link (company login only)
```

### Office ticket page — hand-off status strip

```tsx
// factor tickets show one of: green "sent to the factoring app <time>";
// amber "<factor_error>" + [Resend to factoring] (POST /api/.../factor);
// grey "goes to the factoring app automatically once the office approves".
// List rows badge: "Factored", red "Factoring not sent", or "Factor pay".
```
