// ============================================================================
// Field tickets (work orders) — shared types, hour math, and the QuickBooks
// invoice routine the office triggers on approval.
// ============================================================================
// A ticket's money is always recomputed from the row, never trusted from the
// client: worked hours come from start/stop (or the typed total on a paper
// copy), less down time, plus the job's travel and any time waited — and an
// hourly job's minimum on a short day. The rate_unit says what the rate
// applies to — hours, tons, loads, or the day. Tonnage on an hourly ticket
// is information, not a bill.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createInvoice, fetchInvoicePdf, attachFileToInvoice } from '@/lib/quickbooks';
import { ensureTicketPdf } from '@/lib/ticket-pdf';

export const WORK_ORDER_STATUSES = [
  'draft',
  'submitted',
  'office_approved',
  'funds_approved',
  'invoiced',
  'rejected',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  // Stored as 'submitted'; the crew's word for it is "completed", so that is
  // what every screen shows. Changing the stored value would mean migrating
  // live rows for a wording change.
  submitted: 'Completed',
  office_approved: 'Office approved',
  funds_approved: 'Funds approved',
  invoiced: 'Invoiced',
  rejected: 'Rejected',
};

// Tailwind classes per status, so every screen badges a ticket the same way.
export const STATUS_TONE: Record<WorkOrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  submitted: 'bg-amber-100 text-amber-900 border-amber-200',
  office_approved: 'bg-blue-100 text-blue-900 border-blue-200',
  funds_approved: 'bg-indigo-100 text-indigo-900 border-indigo-200',
  invoiced: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

export type WorkOrder = {
  id: string;
  customer_id: string | null;
  business_id: string | null;
  customer_number: string | null;
  job_number: string | null;
  job_name: string | null;
  job_address: string | null;
  driver_name: string | null;
  ticket_number: string | null;
  hauler_id: string | null;
  hauler_load_id: string | null;
  trucking_company: string | null;
  material: string | null;
  supplier: string | null;
  truck_type: string | null;
  truck_type_tons: number | null;
  plate_number: string | null;
  driver_start_at: string | null;
  driver_end_at: string | null;
  signed_out_state: 'loaded' | 'empty' | null;
  sign_out_at: string | null;
  foreman_signature_path: string | null;
  // Who signed, typed in their own words, and when — the drawn image alone
  // doesn't say whose hand it was.
  signature_name: string | null;
  signature_signed_at: string | null;
  foreman_signature_name: string | null;
  foreman_signature_signed_at: string | null;
  office_start_haul: string | null;
  office_end_haul: string | null;
  office_travel_hours: number | null;
  office_total_hours: number | null;
  office_comments: string | null;
  // Rolled up off the load lines by a database trigger, so every screen
  // totals a ticket the same way without having to fetch its lines.
  loads_count: number;
  loads_tons: number;
  // The order this ticket was filed against, and what disagrees with it.
  order_id: string | null;
  order_mismatch: string | null;
  mismatch_cleared_by: string | null;
  mismatch_cleared_at: string | null;
  day_number: string | null;
  phase_code: string | null;
  claim_number: string | null;
  unit_number: string | null;
  equipment_type: string | null;
  fsr: string | null;
  job_date: string | null;
  start_at: string | null;
  stop_at: string | null;
  // Set per job by the office (on the order); the driver can't change it.
  travel_hours: number | null;
  down_hours: number | null;
  // Time the driver waited at the pit or the job — the driver's own number.
  extra_hours: number | null;
  // When the office wants the driver there ('HH:MM:SS'), set on dispatch.
  report_time: string | null;
  // HT-<n>: the ticket's own number, from a sequence. Never typed.
  ticket_no: number | null;
  // Which form the ticket prints on (lib/ticket-formats.ts); null = Bone's.
  ticket_format: string | null;
  // Bone's own invoice number (INV-<n>) once one has been sent.
  invoice_no: number | null;
  // Paper copy: photos of a paper ticket plus typed totals, no stamps.
  paper: boolean;
  paper_hours: number | null;
  paper_loads: number | null;
  // The job's minimum hours (hourly jobs), copied from the order.
  min_hours: number | null;
  reminded_at: string | null;
  rate: number | null;
  // What the rate applies to: 'hour', 'ton', 'load', or 'day'. Inherited from
  // the order (or the dispatched load). Null on old tickets, which fall back
  // to the original guess: tonnage present bills tons, otherwise hours.
  rate_unit: string | null;
  tonnage: number | null;
  tonnage_type: string | null;
  ticket_photo_path: string | null;
  short_ticket_path: string | null;
  signature_path: string | null;
  submitted_by: string | null;
  // The driver a hauling company handed the ticket to (may differ from who
  // created it); the ticket follows a reassignment.
  assigned_to: string | null;
  contractor_id: string | null;
  submitted_at: string | null;
  status: WorkOrderStatus;
  office_approved_by: string | null;
  office_approved_at: string | null;
  contractor_approved_by: string | null;
  contractor_approved_at: string | null;
  funder_approved_by: string | null;
  funder_approved_at: string | null;
  rejected_reason: string | null;
  qb_invoice_id: string | null;
  qb_invoice_number: string | null;
  qb_synced_at: string | null;
  // 'factor' hands the approved ticket to the factoring service to fund;
  // 'standard' (or null) stays on the normal pay run. The hauler picks when
  // completing the ticket.
  payment_method: 'standard' | 'factor' | null;
  factor_sent_at: string | null;
  factor_error: string | null;
  // Live progress to the funding app (lib/factoring.ts sendTicketProgress).
  factor_progress_sent_at: string | null;
  factor_progress_hash: string | null;
  factor_progress_error: string | null;
  // The place check (lib/place-check.ts PlaceCheck), written server-side.
  place_check: Record<string, unknown> | null;
  place_check_at: string | null;
  // A bill-of-sale signature older than this doesn't count — set when the
  // office sends the ticket back and the numbers change under the signature.
  bos_reset_at: string | null;
  // The generated haul-ticket PDF in the work-tickets bucket.
  ticket_pdf_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// One line off the paper ticket: a single load, its four stamps, and what it
// weighed. Every stamp keeps the GPS fix taken at the same moment — the time
// alone settles nothing when a driver and a foreman remember a day
// differently.
// The ticket's own number as people say it.
export function ticketLabel(wo: { ticket_no?: number | null; id?: string | null }): string {
  if (wo.ticket_no != null) return `HT-${wo.ticket_no}`;
  return wo.id ? wo.id.slice(0, 6).toUpperCase() : 'New';
}

export type WorkOrderLoad = {
  id: string;
  work_order_id: string;
  load_no: number;
  ticket_number: string | null;
  load_in_at: string | null;
  load_in_lat: number | null;
  load_in_lng: number | null;
  load_in_accuracy: number | null;
  load_out_at: string | null;
  load_out_lat: number | null;
  load_out_lng: number | null;
  load_out_accuracy: number | null;
  unload_in_at: string | null;
  unload_in_lat: number | null;
  unload_in_lng: number | null;
  unload_in_accuracy: number | null;
  unload_out_at: string | null;
  unload_out_lat: number | null;
  unload_out_lng: number | null;
  unload_out_accuracy: number | null;
  tons: number | null;
  material: string | null;
  // Photo of the scale ticket / BOL for this load (work-tickets bucket).
  bol_photo_path: string | null;
  // Which stamps were typed in rather than tapped.
  typed_stamps: string[] | null;
  created_at: string;
  updated_at: string;
};

// The truck's day off the stamps: the first Load in and the last Unload out.
// These are the ticket's start and stop on a driver's ticket — the driver
// never types a time, they tap at the pit and at the site.
export function stampSpan(loads: Pick<WorkOrderLoad, 'load_in_at' | 'unload_out_at'>[]): { firstIn: string | null; lastOut: string | null } {
  let firstIn: string | null = null;
  let lastOut: string | null = null;
  for (const l of loads) {
    if (l.load_in_at && (!firstIn || l.load_in_at < firstIn)) firstIn = l.load_in_at;
    if (l.unload_out_at && (!lastOut || l.unload_out_at > lastOut)) lastOut = l.unload_out_at;
  }
  return { firstIn, lastOut };
}

// The four stamps in the order they happen on a run.
export const LOAD_STAMPS = [
  { key: 'load_in', label: 'Load in' },
  { key: 'load_out', label: 'Load out' },
  { key: 'unload_in', label: 'Unload in' },
  { key: 'unload_out', label: 'Unload out' },
] as const;
export type LoadStampKey = (typeof LOAD_STAMPS)[number]['key'];

// Tons actually hauled, summed off the load lines.
export function totalLoadTons(loads: Pick<WorkOrderLoad, 'tons'>[]): number {
  const sum = loads.reduce((n, l) => n + Number(l.tons || 0), 0);
  return Math.round(sum * 100) / 100;
}

// A load counts once it has been started — an untouched row on a 28-line pad
// is not a load that ran.
export function countLoads(loads: Pick<WorkOrderLoad, 'load_in_at' | 'tons'>[]): number {
  return loads.filter((l) => l.load_in_at || Number(l.tons || 0) > 0).length;
}

// The columns a crew member (or the office) may set on a ticket. Everything
// else — status, the approval stamps, the QuickBooks link — is server-owned.
export const EDITABLE_FIELDS = [
  'order_id',
  'customer_id', 'business_id', 'customer_number', 'job_number', 'job_name',
  'job_address', 'day_number', 'phase_code', 'claim_number', 'unit_number',
  'equipment_type', 'fsr', 'job_date', 'driver_name', 'ticket_number',
  'hauler_id', 'hauler_load_id', 'trucking_company', 'material', 'supplier',
  'truck_type', 'truck_type_tons', 'plate_number', 'driver_start_at', 'driver_end_at',
  'signed_out_state', 'sign_out_at', 'foreman_signature_path',
  'signature_name', 'signature_signed_at',
  'foreman_signature_name', 'foreman_signature_signed_at',
  'start_at', 'stop_at', 'travel_hours', 'down_hours', 'extra_hours', 'report_time', 'rate', 'rate_unit',
  'paper', 'paper_hours', 'paper_loads', 'ticket_format',
  'tonnage', 'tonnage_type', 'ticket_photo_path', 'short_ticket_path',
  'signature_path', 'contractor_id', 'payment_method', 'notes',
] as const;

// On a hauler's ticket that came from a dispatched job, these are the ORDER's
// facts, not the driver's: the job, where it is, what phase it bills under,
// and what the hauler is paid. The driver's half of the ticket is the times,
// the loads, the truck, and the signatures. Locked in the form and stripped
// server-side, because a form is not a boundary.
export const ORDER_LOCKED_FIELDS = [
  'customer_number', 'job_number', 'job_name', 'job_address', 'phase_code',
  'claim_number', 'fsr', 'rate', 'rate_unit',
] as const;

const NUMERIC_FIELDS = new Set([
  'travel_hours', 'down_hours', 'extra_hours', 'rate', 'tonnage', 'truck_type_tons',
  'paper_hours', 'paper_loads',
  'office_travel_hours', 'office_total_hours',
]);

// Keep only the editable columns from a request body, coercing '' to null so a
// cleared input doesn't try to store an empty string in a numeric/date column.
export function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === '' || raw === undefined) { out[key] = null; continue; }
    if (raw !== null && NUMERIC_FIELDS.has(key)) {
      const n = Number(raw);
      out[key] = Number.isFinite(n) ? n : null;
      continue;
    }
    out[key] = raw;
  }
  return out;
}

// Hours between clock-in and clock-out, to two decimals. Same math as the time
// clock: absolute instants, so a shift crossing midnight (or a timezone line)
// still measures right.
export function onSiteHours(startAt: string | null, stopAt: string | null): number {
  if (!startAt || !stopAt) return 0;
  const ms = new Date(stopAt).getTime() - new Date(startAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

// The hours the truck worked, before travel: off the stamps (start/stop) on
// a digital ticket, typed off the paper on a paper copy.
export function truckHours(wo: Pick<WorkOrder, 'start_at' | 'stop_at'> & { paper?: boolean | null; paper_hours?: number | null }): number {
  if (wo.paper) return Math.max(0, Number(wo.paper_hours || 0));
  return onSiteHours(wo.start_at, wo.stop_at);
}

// Total hours on the ticket: truck hours, minus down time (the truck wasn't
// working), plus the job's travel and any time waited. Never below zero.
type Hours = Pick<WorkOrder, 'start_at' | 'stop_at' | 'travel_hours' | 'down_hours'>
  & { extra_hours?: number | null; paper?: boolean | null; paper_hours?: number | null };
export function totalHours(wo: Hours): number {
  const sum = truckHours(wo)
    - Number(wo.down_hours || 0)
    + Number(wo.travel_hours || 0)
    + Number(wo.extra_hours || 0);
  return Math.max(0, Math.round(sum * 100) / 100);
}

// What an hourly ticket bills: its hours, or the job's minimum on a short day.
export function billableHours(wo: Hours & { min_hours?: number | null }): number {
  return Math.max(totalHours(wo), Number(wo.min_hours || 0));
}

// The fields the billing math reads. loads_count/loads_tons are optional so
// callers holding a form draft (no trigger-maintained rollups) still fit.
type Billable = Pick<WorkOrder,
  'start_at' | 'stop_at' | 'travel_hours' | 'down_hours' | 'tonnage'>
  & { extra_hours?: number | null; paper?: boolean | null; paper_hours?: number | null; paper_loads?: number | null;
      min_hours?: number | null; rate_unit?: string | null; loads_tons?: number | null; loads_count?: number | null };

// What the ticket bills: the rate times whatever quantity its rate_unit says.
export function ticketAmount(wo: Billable & Pick<WorkOrder, 'rate'>,
  loads?: Pick<WorkOrderLoad, 'tons'>[]): number {
  const rate = Number(wo.rate || 0);
  const qty = billableQuantity(wo, loads);
  return Math.round(rate * qty * 100) / 100;
}

// The tonnage a ticket bills. The load lines are the record when they carry
// weights — that's what the scale house handed over, line by line — and the
// header tonnage is the fallback for a ticket filled out without them.
//
// Callers that already hold the lines (the form, mid-edit) pass them; everyone
// else reads loads_tons off the row, which the trigger keeps in step. Both
// routes land on the same number, which is the point.
export function effectiveTonnage(
  wo: Pick<WorkOrder, 'tonnage'> & { loads_tons?: number | null },
  loads?: Pick<WorkOrderLoad, 'tons'>[],
): number {
  const fromLines = loads ? totalLoadTons(loads) : Number(wo.loads_tons || 0);
  return fromLines > 0 ? fromLines : Number(wo.tonnage || 0);
}

// The quantity the rate applies to. The rate_unit decides: an hourly job
// bills hours even when tonnage was written down — there the tonnage is
// information for the office, not the bill. Only a ticket with no unit at all
// (filled before units existed, or by hand with no order) falls back to the
// old guess: tonnage present bills tons, otherwise hours.
export function billableQuantity(wo: Billable,
  loads?: Pick<WorkOrderLoad, 'tons'>[]): number {
  switch (wo.rate_unit) {
    case 'hour': return billableHours(wo);
    case 'ton': return effectiveTonnage(wo, loads);
    // A paper copy has no load lines; its load count is typed.
    case 'load': return wo.paper ? Number(wo.paper_loads || 0) : Number(wo.loads_count || 0);
    // A ticket is one day's work by construction — the day rate bills once.
    case 'day': return 1;
  }
  const tons = effectiveTonnage(wo, loads);
  return tons > 0 ? tons : billableHours(wo);
}

export function billableUnit(
  wo: Pick<WorkOrder, 'tonnage' | 'tonnage_type'>
    & { rate_unit?: string | null; loads_tons?: number | null; loads_count?: number | null },
  loads?: Pick<WorkOrderLoad, 'tons'>[],
): string {
  switch (wo.rate_unit) {
    case 'hour': return 'hrs';
    case 'ton': return wo.tonnage_type || 'tons';
    case 'load': return 'loads';
    case 'day': return 'day';
  }
  return effectiveTonnage(wo, loads) > 0 ? (wo.tonnage_type || 'tons') : 'hrs';
}

// A one-line summary of the job for the invoice line's description.
export function ticketDescription(wo: WorkOrder): string {
  return [
    wo.job_number ? `Job ${wo.job_number}` : null,
    wo.job_name || null,
    wo.day_number ? `Day ${wo.day_number}` : null,
    wo.phase_code ? `Phase ${wo.phase_code}` : null,
    wo.unit_number ? `Unit ${wo.unit_number}` : null,
    wo.equipment_type || null,
    wo.claim_number ? `Claim ${wo.claim_number}` : null,
    wo.fsr ? `FSR ${wo.fsr}` : null,
    wo.job_date,
  ].filter(Boolean).join(' · ');
}

export type InvoiceOutcome = { status: number; body: Record<string, unknown> };

// The QuickBooks item every work-order invoice line bills against. An admin
// picks it once on the Work Orders setup screen.
export async function getWorkOrderQbItem(db: SupabaseClient): Promise<{ id: string; name: string } | null> {
  const { data } = await db
    .from('app_settings')
    .select('key, value')
    .in('key', ['work_order_qb_item_id', 'work_order_qb_item_name']);
  const m = new Map(((data as { key: string; value: string }[]) || []).map((r) => [r.key, r.value]));
  const id = (m.get('work_order_qb_item_id') || '').trim();
  if (!id) return null;
  return { id, name: (m.get('work_order_qb_item_name') || '').trim() || 'Labor' };
}

// What a ticket bills the customer: the quantity and the rate, recomputed on
// the server from the row and its load lines. Shared by every way a ticket
// gets invoiced (QuickBooks, or Bone's own invoice) so they can't disagree.
export type TicketBilling =
  | { ok: true; qty: number; rate: number; unit: string; amount: number }
  | { ok: false; error: string };
export async function resolveTicketBilling(db: SupabaseClient, order: WorkOrder): Promise<TicketBilling> {
  // The load lines are the record of what was hauled, so the billable
  // quantity is recomputed from them here rather than trusting whatever
  // tonnage total the ticket was saved with.
  const { data: loadRows } = await db
    .from('work_order_loads')
    .select('tons')
    .eq('work_order_id', order.id);
  const loads = (loadRows as Pick<WorkOrderLoad, 'tons'>[]) || [];

  // The CUSTOMER's rate comes off the order, not the ticket. A hauler's ticket
  // carries what the hauler is owed — billing the customer that number would
  // hand them Bone's margin. Only a ticket with no order falls back to its
  // own rate, and there the two are the same number anyway.
  //
  // The order's rate UNIT and minimum ride along for the same reason: the
  // customer is billed on the terms the order was written under. An hourly
  // order bills hours even when the ticket recorded tonnage — there the
  // tonnage is information, not the bill.
  let rate = Number(order.rate || 0);
  let rateUnit = order.rate_unit || null;
  let minHours = order.min_hours ?? null;
  if (order.order_id) {
    const { data: jo } = await db
      .from('job_orders')
      .select('rate, rate_unit, min_hours')
      .eq('id', order.order_id)
      .maybeSingle();
    const terms = jo as { rate: number | null; rate_unit: string | null; min_hours: number | null } | null;
    const billRate = Number(terms?.rate ?? 0);
    if (billRate > 0) rate = billRate;
    else if (order.hauler_id) {
      return { ok: false, error: 'the order has no customer rate set — add one on the order before invoicing' };
    }
    if (terms?.rate_unit) rateUnit = terms.rate_unit;
    if (terms?.min_hours != null) minHours = terms.min_hours;
  }

  const billed = { ...order, rate_unit: rateUnit, min_hours: minHours };
  const qty = billableQuantity(billed, loads);
  if (qty <= 0) return { ok: false, error: 'nothing to bill — the ticket has no hours, loads or tonnage' };
  if (rate <= 0) return { ok: false, error: 'no rate — set the customer rate on the order before invoicing' };
  return { ok: true, qty, rate, unit: billableUnit(billed, loads), amount: Math.round(qty * rate * 100) / 100 };
}

// Invoice one approved ticket to its customer in QuickBooks, then stamp the
// invoice id/number back onto the row. Runs with whatever client the caller
// passes (the approve route passes the service-role client).
export async function invoiceWorkOrder(db: SupabaseClient, workOrderId: string): Promise<InvoiceOutcome> {
  const { data: wo } = await db
    .from('work_orders')
    .select('*')
    .eq('id', workOrderId)
    .maybeSingle();
  if (!wo) return { status: 404, body: { ok: false, error: 'work order not found' } };
  const order = wo as WorkOrder;

  if (order.qb_invoice_id) {
    return { status: 400, body: { ok: false, error: `already invoiced (#${order.qb_invoice_number || order.qb_invoice_id})` } };
  }

  const billing = await resolveTicketBilling(db, order);
  if ('error' in billing) return { status: 400, body: { ok: false, error: billing.error } };
  const { qty, rate } = billing;

  // Resolve the QuickBooks customer: the linked business first (several
  // profiles can share one), then the customer profile's own mapping.
  let qbCustomerId: string | null = null;
  if (order.business_id) {
    const { data: biz } = await db
      .from('businesses')
      .select('qb_customer_id')
      .eq('id', order.business_id)
      .maybeSingle();
    qbCustomerId = (biz as { qb_customer_id: string | null } | null)?.qb_customer_id ?? null;
  }
  if (!qbCustomerId && order.customer_id) {
    const { data: map } = await db
      .from('customer_qb_mapping')
      .select('qb_customer_id')
      .eq('profile_id', order.customer_id)
      .maybeSingle();
    qbCustomerId = (map as { qb_customer_id: string | null } | null)?.qb_customer_id ?? null;
  }
  if (!qbCustomerId) {
    return { status: 400, body: { ok: false, error: 'this customer isn’t linked to QuickBooks yet — link them on the Customers tab first' } };
  }

  const item = await getWorkOrderQbItem(db);
  if (!item) {
    return { status: 400, body: { ok: false, error: 'no QuickBooks item is set for work orders — an admin needs to pick one under Work Orders setup' } };
  }

  let invoice;
  try {
    invoice = await createInvoice({
      qbCustomerId,
      lines: [{
        qbItemId: item.id,
        qbItemName: item.name,
        quantity: qty,
        unitPrice: rate,
        description: ticketDescription(order),
      }],
      customerMemo: order.notes || undefined,
      poNumber: order.job_number || undefined,
    });
  } catch (err) {
    return {
      status: 502,
      body: { ok: false, error: err instanceof Error ? err.message : 'QuickBooks invoice failed' },
    };
  }

  // The haul ticket itself rides on the invoice: a generated PDF of the whole
  // ticket — job, times, load lines, signatures — attached in QuickBooks so
  // the customer's copy carries its own proof. Best-effort, like everything
  // after the invoice exists.
  const docNumberForFiles = invoice.DocNumber || invoice.Id;
  try {
    const ticketPdf = await ensureTicketPdf(db, order.id);
    if (ticketPdf) {
      await attachFileToInvoice(
        invoice.Id, ticketPdf.bytes,
        `haul-ticket-${docNumberForFiles}.pdf`, 'application/pdf', db,
      );
    }
  } catch { /* the invoice stands; the attachment can be redone by re-approving */ }

  // The office invoices as soon as it approves, which is usually BEFORE the
  // funder has released funds — so raising the invoice doesn't by itself
  // finish the chain. A ticket only becomes 'invoiced' once both have
  // happened; until the funder signs off it stays 'office_approved' and keeps
  // showing up on their queue.
  const docNumber = invoice.DocNumber || invoice.Id;
  await db.from('work_orders').update({
    status: order.funder_approved_at ? 'invoiced' : order.status,
    qb_invoice_id: invoice.Id,
    qb_invoice_number: docNumber,
    qb_synced_at: new Date().toISOString(),
  }).eq('id', order.id);

  // Cache the PDF next to the ticket so the office can hand it over without a
  // second QuickBooks round-trip. Best-effort — the invoice itself is done.
  let pdfPath: string | null = null;
  try {
    const pdf = await fetchInvoicePdf(invoice.Id);
    pdfPath = `work-orders/${order.id}/invoice-${docNumber}.pdf`;
    await db.storage.from('invoices').upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
  } catch { pdfPath = null; }

  return {
    status: 200,
    body: {
      ok: true,
      invoice_id: invoice.Id,
      invoice_number: docNumber,
      amount: Math.round(qty * rate * 100) / 100,
      pdf_path: pdfPath,
    },
  };
}
