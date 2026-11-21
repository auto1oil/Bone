// GET    /api/work-orders/[id] — one ticket (RLS decides visibility).
// PATCH  /api/work-orders/[id] — edit a ticket's fields, and optionally submit it.
// DELETE /api/work-orders/[id] — remove a draft (its author, or an admin).
//
// Only the editable columns are ever written here. Status moves are limited to
// the one a crew member is allowed to make themselves — draft (or a ticket the
// office sent back) → submitted; every approval goes through ./approve.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { pickEditable, ORDER_LOCKED_FIELDS, stampSpan } from '@/lib/work-orders';
import { loadOrder, jobPickProblem, jobFacts, noJobFacts, finishProblem, JOB_FACT_FIELDS } from '@/lib/ticket-rules';
import { withOrderMismatch } from '@/lib/order-match';
import { requestBillOfSale, checkFactoringLink, sendTicketProgress } from '@/lib/factoring';
import { runPlaceCheck } from '@/lib/place-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, work_order: data });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const patch = pickEditable(body);
  if (body.submit === true) {
    patch.status = 'submitted';
    patch.submitted_at = new Date().toISOString();
    // Resubmitting clears the note the office sent it back with, so a fixed
    // ticket doesn't keep showing the old complaint.
    patch.rejected_reason = null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'nothing to update' }, { status: 400 });
  }

  // Reconcile against the order before writing. A partial update still gets
  // compared on the ticket's full values, so changing only the rate is still
  // checked against the order's phase and dates.
  const { data: before } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  // A hauler's ticket that came off a dispatched job keeps the job's facts:
  // the form greys these fields out, and this strips them from anyone who
  // posts them anyway. The office editing the same ticket is not affected.
  const { data: actor } = await supabase
    .from('profiles').select('role, hauler_id').eq('id', user.id).single();
  if (actor?.hauler_id && before && (before.order_id || before.hauler_load_id)) {
    for (const k of ORDER_LOCKED_FIELDS) delete patch[k];
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'those fields came with the job and cannot be changed' },
        { status: 400 },
      );
    }
  }

  // Factor Payment is a privilege the factoring app grants per company and
  // can revoke at any time — so a hauler-side write of 'factor' is checked
  // live, not against the button that happened to be on screen.
  if (patch.payment_method === 'factor' && actor?.hauler_id) {
    const link = await checkFactoringLink(createAdminClient(), actor.hauler_id);
    if (link.status !== 'linked') patch.payment_method = 'standard';
  }

  // A crew member's finished day is clocked by the stamps, not by what the
  // browser posted: start is the first Load in, stop the last Unload out.
  // The form shows the same figures; this is the half that can't be edited.
  // The office keeps its hand on the times when it edits a ticket itself.
  const isOffice = !!actor && ['office', 'admin', 'master_admin'].includes(actor.role);
  const bone = !isOffice && !actor?.hauler_id;   // Bone's own crew

  // Travel on a job is the office's number, set per job on the order. A
  // crew member's ticket against an order keeps it; their waiting time goes
  // in extra_hours instead.
  if (!isOffice && before?.order_id) delete patch.travel_hours;

  // ---- The job on a Bone crew ticket ---------------------------------
  // Start now, pick the job later: the job is free to pick or change while
  // the ticket is still the driver's. Once it's in, only the office moves
  // it. Whatever job it is, the job's facts and the rate are written from
  // the order here, never taken from the request.
  if (bone && before) {
    const changing = 'order_id' in patch && (patch.order_id || null) !== (before.order_id || null);
    if (changing && !['draft', 'rejected'].includes(before.status)) {
      return NextResponse.json({ ok: false, error: 'This ticket is already in — the office moves it if it\u2019s the wrong job.' }, { status: 400 });
    }
    for (const k of JOB_FACT_FIELDS) delete patch[k];
    if (changing) {
      if (patch.order_id) {
        const order = await loadOrder(createAdminClient(), patch.order_id as string);
        const problem = jobPickProblem(order, (patch.job_date as string) || before.job_date);
        if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
        Object.assign(patch, jobFacts(order!));
      } else {
        Object.assign(patch, noJobFacts());
      }
    }
  }

  // The office moving a ticket to a different job: it takes the new job's
  // facts with it (a lessor's ticket takes that job's pay rate, not the
  // customer's). Refused once the ticket is invoiced — the money is booked.
  if (isOffice && before && 'order_id' in patch && patch.order_id && patch.order_id !== before.order_id) {
    if (before.status === 'invoiced') {
      return NextResponse.json({ ok: false, error: 'This ticket is already invoiced — it can\u2019t be moved to another job.' }, { status: 400 });
    }
    const order = await loadOrder(createAdminClient(), patch.order_id as string);
    if (!order) return NextResponse.json({ ok: false, error: 'that order no longer exists' }, { status: 400 });
    Object.assign(patch, jobFacts(order));
    if (before.hauler_id) patch.rate = order.pay_rate;
  }

  if (body.submit === true && !isOffice && before) {
    const { data: loadRows } = await supabase
      .from('work_order_loads')
      .select('load_no, load_in_at, load_out_at, unload_in_at, unload_out_at, tons, bol_photo_path')
      .eq('work_order_id', params.id);
    type L = Parameters<typeof finishProblem>[1][number];
    const loads = (loadRows as L[]) || [];
    // Finish is refused until the ticket is whole: a job, at least one load
    // (or a photo of the paper), and a BOL photo on every load.
    const problem = finishProblem({ ...before, ...patch } as never, loads, bone);
    if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
    // A finished day is clocked by the stamps, not by what the browser
    // posted: start is the first Load in, stop the last Unload out. A paper
    // copy has no stamps; its hours are the typed total.
    const paper = !!({ ...before, ...patch } as { paper?: boolean }).paper;
    const { firstIn, lastOut } = stampSpan(loads);
    if (!paper && firstIn && lastOut) {
      patch.start_at = firstIn; patch.stop_at = lastOut;
      patch.driver_start_at = firstIn; patch.driver_end_at = lastOut;
    }
    if (paper) { patch.start_at = null; patch.stop_at = null; }
  }

  const finalPatch = await withOrderMismatch(supabase, patch, before);

  // RLS keeps a crew member to their own draft/submitted rows and lets
  // office/admin edit anything, so no extra role check is needed here.
  const { data, error } = await supabase
    .from('work_orders')
    .update(finalPatch)
    .eq('id', params.id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'not found or not yours to edit' }, { status: 403 });

  // A hauler completing a Factor Payment ticket signs the factoring app's
  // bill of sale first. The check runs AFTER the save so the document is
  // refreshed against the numbers just written; an unsigned one puts the
  // ticket back to its previous status with everything else kept. If the
  // factoring app can't answer, completion goes through — a signature
  // requirement must not hinge on someone else's uptime.
  if (
    body.submit === true
    && actor?.hauler_id
    && (data as { payment_method: string | null }).payment_method === 'factor'
  ) {
    const admin = createAdminClient();
    const bos = await requestBillOfSale(admin, params.id);
    // A signature only counts if it's newer than the last send-back: the
    // office rejecting the ticket means the numbers changed under the old
    // signature, so the refreshed document has to be agreed to again.
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

  // Tell the office a ticket is waiting. Best-effort: a failed notify must not
  // fail the submit.
  if (body.submit === true) {
    try {
      const { data: staff } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['office', 'admin', 'master_admin']);
      const rows = ((staff as { id: string }[]) || []).map((s) => ({
        recipient_id: s.id,
        kind: 'work_order_submitted',
        title: `Ticket submitted${data.job_number ? ` — job ${data.job_number}` : ''}`,
        body: [data.unit_number ? `Unit ${data.unit_number}` : null, data.job_date].filter(Boolean).join(' · ') || null,
        link: `/work-orders/${data.id}`,
      }));
      if (rows.length) await supabase.from('notifications').insert(rows);
    } catch { /* notification is a nicety, the ticket is submitted either way */ }
  }

  // Where the truck was against where the job says. Best-effort and never a
  // gate; the audit reads the result off the row.
  const checked = await runPlaceCheck(createAdminClient(), params.id);
  const fresh = checked ? { ...data, place_check: checked, place_check_at: checked.checked_at } : data;

  return NextResponse.json({ ok: true, work_order: fresh });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: existing } = await supabase
    .from('work_orders')
    .select('id, status, submitted_by')
    .eq('id', params.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

  // Deleting a ticket is admin only — an invoiced ticket is a record. The one
  // exception is a crew member discarding a draft they never submitted.
  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = ['admin', 'master_admin'].includes(actor?.role || '');
  if (!isAdmin && !(existing.submitted_by === user.id && existing.status === 'draft')) {
    return NextResponse.json({ ok: false, error: 'only an admin can delete a ticket (or you, a draft you created)' }, { status: 403 });
  }

  // If the funding app was watching this ticket, tell it to let go. Best-effort.
  await sendTicketProgress(createAdminClient(), params.id, { withdrawn: true });

  const { error } = await supabase.from('work_orders').delete().eq('id', params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
