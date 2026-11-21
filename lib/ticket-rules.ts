// The haul ticket's rules that have to hold whatever the phone posts:
// which job a crew member may put a ticket on, what the ticket takes from
// that job, and what a ticket needs before it can be finished.
//
// The shape is "start now, pick the job later": a ticket can be started,
// stamped and photographed with no job on it, because the times, loads and
// photos live on the ticket. The job is only required to finish.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobOrder } from '@/lib/job-orders';
import type { WorkOrder, WorkOrderLoad } from '@/lib/work-orders';

// What a Bone crew ticket takes from its job. These are the job's facts and
// the office's numbers — the rate above all — so they are written by the
// server from the order, never from the request.
export const JOB_FACT_FIELDS = [
  'business_id', 'customer_number', 'job_number', 'job_name', 'job_address',
  'supplier', 'phase_code', 'fsr', 'rate', 'rate_unit', 'travel_hours', 'min_hours',
] as const;

export function jobFacts(o: JobOrder): Record<string, unknown> {
  return {
    business_id: o.business_id,
    customer_number: o.customer_number,
    job_number: o.job_number,
    job_name: o.job_name,
    job_address: o.job_address,
    // The pit on the ticket is where the order says the trucks load.
    supplier: o.pickup_address,
    phase_code: o.phase_code,
    fsr: o.fsr,
    rate: o.rate,
    rate_unit: o.rate_unit,
    travel_hours: o.travel_hours,
    min_hours: o.min_hours ?? null,
  };
}

// Nulls for every job fact — a ticket with no job carries none of them.
export function noJobFacts(): Record<string, unknown> {
  return Object.fromEntries(JOB_FACT_FIELDS.map((k) => [k, null]));
}

// May a ticket dated `jobDate` go on this order? Null when it may; otherwise
// the sentence to show the driver.
export function jobPickProblem(o: JobOrder | null, jobDate: string | null): string | null {
  if (!o) return 'That job is not there any more — pick another.';
  if (o.status !== 'open' && o.status !== 'active') return 'That job is closed — ask the office.';
  if (jobDate) {
    if (o.start_date && jobDate < o.start_date) return `That job doesn't start until ${o.start_date}.`;
    if (o.end_date && jobDate > o.end_date) return `That job ended ${o.end_date} — ask the office.`;
  }
  return null;
}

// An order that is running on a given day: open, and the day inside its
// dates (an order with no dates is always running).
export function runsOn(o: Pick<JobOrder, 'status' | 'start_date' | 'end_date'>, day: string): boolean {
  if (o.status !== 'open' && o.status !== 'active') return false;
  if (o.start_date && day < o.start_date) return false;
  if (o.end_date && day > o.end_date) return false;
  return true;
}

export async function loadOrder(admin: SupabaseClient, orderId: string): Promise<JobOrder | null> {
  const { data } = await admin.from('job_orders').select('*').eq('id', orderId).maybeSingle();
  return (data as JobOrder | null) ?? null;
}

type Load = Pick<WorkOrderLoad, 'load_no' | 'load_in_at' | 'load_out_at' | 'unload_in_at' | 'unload_out_at' | 'tons' | 'bol_photo_path'>;

// Why a ticket can't be finished yet, or null when it can. `bone` is a
// ticket filed by Bone's own crew (it must be on an order); a lessor's crew
// can't read orders, so theirs needs the job number that came with the load.
export function finishProblem(
  t: Pick<WorkOrder, 'order_id' | 'job_number' | 'paper' | 'ticket_photo_path' | 'short_ticket_path'>,
  loads: Load[],
  bone: boolean,
): string | null {
  if (bone ? !t.order_id : !(t.order_id || (t.job_number || '').trim())) {
    return 'Pick the job this ticket is for first — it’s at the top of the ticket.';
  }
  if (t.paper) {
    if (!t.ticket_photo_path && !t.short_ticket_path) return 'Add a photo of the paper ticket before finishing.';
    return null;
  }
  const ran = loads.filter((l) => l.load_in_at || l.load_out_at || l.unload_in_at || l.unload_out_at || Number(l.tons || 0) > 0);
  if (ran.length === 0) return 'Stamp at least one load before finishing.';
  if (!ran.some((l) => l.load_in_at) || !ran.some((l) => l.unload_out_at)) {
    return 'The day needs a Load in and an Unload out — those set the start and end.';
  }
  const noBol = ran.filter((l) => !l.bol_photo_path).map((l) => l.load_no).sort((a, b) => a - b);
  if (noBol.length) {
    return noBol.length === 1
      ? `Load ${noBol[0]} needs its BOL photo.`
      : `Loads ${noBol.join(', ')} need their BOL photos.`;
  }
  return null;
}

// What the audit should look at on a ticket's loads: missing times, missing
// BOL photos, and times that were typed rather than tapped.
export function loadFlags(loads: (Load & { typed_stamps?: string[] | null })[]): string[] {
  const out: string[] = [];
  for (const l of [...loads].sort((a, b) => a.load_no - b.load_no)) {
    const missing = (['load_in', 'load_out', 'unload_in', 'unload_out'] as const)
      .filter((k) => !l[`${k}_at`]).map((k) => k.replace('_', ' '));
    if (missing.length === 4 && !(Number(l.tons || 0) > 0)) continue; // an untouched line
    if (missing.length) out.push(`Load ${l.load_no}: no ${missing.join(', ')} time`);
    if (!l.bol_photo_path) out.push(`Load ${l.load_no}: no BOL photo`);
    if (l.typed_stamps && l.typed_stamps.length) out.push(`Load ${l.load_no}: ${l.typed_stamps.length === 1 ? 'a time was' : `${l.typed_stamps.length} times were`} typed, not tapped`);
  }
  return out;
}
