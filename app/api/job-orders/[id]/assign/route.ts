// POST   /api/job-orders/[id]/assign — send an order to Bone's own drivers.
// DELETE /api/job-orders/[id]/assign?ticket=<id> — take an untouched job back.
//
// Lessors get an order through hauler loads (offer → accept → their driver).
// Bone's own drivers get it here: the office picks drivers (and, if it wants,
// the truck each one takes) and a draft haul ticket is made for each, already
// filled from the order, owned by the driver, waiting on their home screen.
// Each driver gets a bell notification and a push.
//
// Office and admin only, checked here because this runs as the service role
// (it writes tickets the driver owns). Drivers are taken only from Bone's own
// active driver/mechanic logins — never a lessor's — whatever the client
// posts. Taking a job back deletes the draft, so that is admin only, the same
// line as every other ticket delete, and only while nothing is stamped on it.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushToUsers } from '@/lib/webpush';
import { ticketDefaultsFrom, type JobOrder } from '@/lib/job-orders';
import { withOrderMismatch } from '@/lib/order-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DRIVER_ROLES = ['driver', 'mechanic'];
// The order's defaults come back as strings for the form; these are numbers
// in the table.
const NUMERIC = new Set(['rate', 'travel_hours', 'down_hours']);

async function caller() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 }) };
  const { data: me } = await supabase.from('profiles').select('id, role, full_name, email').eq('id', user.id).single();
  if (!me) return { error: NextResponse.json({ ok: false, error: 'no profile' }, { status: 403 }) };
  return { me: me as { id: string; role: string; full_name: string | null; email: string } };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await caller();
  if (gate.error) return gate.error;
  const me = gate.me!;
  if (!['office', 'admin', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ ok: false, error: 'office or admin only' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    job_date?: string;
    assignments?: { driver_id?: string; vehicle_id?: string | null }[];
  };
  const jobDate = typeof body.job_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.job_date) ? body.job_date : '';
  const wanted = (body.assignments || []).filter((a) => typeof a.driver_id === 'string' && a.driver_id);
  if (!jobDate) return NextResponse.json({ ok: false, error: 'pick the day' }, { status: 400 });
  if (wanted.length === 0) return NextResponse.json({ ok: false, error: 'pick at least one driver' }, { status: 400 });

  const db = createAdminClient();
  const { data: orderRow } = await db.from('job_orders').select('*').eq('id', params.id).maybeSingle();
  const order = orderRow as JobOrder | null;
  if (!order) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 });
  if (order.status !== 'open' && order.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'that order is closed — reopen it to send it out' }, { status: 400 });
  }

  const driverIds = Array.from(new Set(wanted.map((a) => a.driver_id!)));
  const vehicleIds = Array.from(new Set(wanted.map((a) => a.vehicle_id).filter((v): v is string => !!v)));
  const [{ data: people }, { data: trucks }, { data: assignedTrucks }, { data: existing }] = await Promise.all([
    db.from('profiles').select('id, full_name, email, role, hauler_id, active').in('id', driverIds),
    vehicleIds.length
      ? db.from('fleet_vehicles').select('id, unit_number, plate').in('id', vehicleIds)
      : Promise.resolve({ data: [] }),
    db.from('fleet_vehicles').select('unit_number, plate, assigned_driver_id').in('assigned_driver_id', driverIds).eq('active', true),
    // A driver already on this order that day isn't sent it twice.
    db.from('work_orders').select('id, assigned_to, submitted_by')
      .eq('order_id', order.id).eq('job_date', jobDate),
  ]);

  type Person = { id: string; full_name: string | null; email: string; role: string; hauler_id: string | null; active: boolean | null };
  const byId = new Map(((people as Person[]) || []).map((p) => [p.id, p]));
  const truckById = new Map(((trucks as { id: string; unit_number: string; plate: string | null }[]) || []).map((t) => [t.id, t]));
  const usualTruck = new Map(((assignedTrucks as { unit_number: string; plate: string | null; assigned_driver_id: string }[]) || [])
    .map((t) => [t.assigned_driver_id, t]));
  const alreadyOn = new Set<string>();
  for (const w of (existing as { assigned_to: string | null; submitted_by: string | null }[]) || []) {
    if (w.assigned_to) alreadyOn.add(w.assigned_to);
    if (w.submitted_by) alreadyOn.add(w.submitted_by);
  }

  const defaults = ticketDefaultsFrom(order, false);
  const sent: { driver: string; ticket_id: string }[] = [];
  const skipped: { driver: string; reason: string }[] = [];

  for (const a of wanted) {
    const p = byId.get(a.driver_id!);
    const name = p?.full_name || p?.email || 'That driver';
    if (!p || !DRIVER_ROLES.includes(p.role) || p.hauler_id || p.active === false) {
      skipped.push({ driver: name, reason: 'not one of Bone’s active drivers' });
      continue;
    }
    if (alreadyOn.has(p.id)) {
      skipped.push({ driver: name, reason: 'already has this job that day' });
      continue;
    }

    // Their truck: the one picked here, else their fleet assignment, else
    // the order's unit; type and carrier off their last ticket.
    const { data: lastRows } = await db.from('work_orders')
      .select('unit_number, plate_number, truck_type, truck_type_tons, trucking_company')
      .eq('submitted_by', p.id).order('created_at', { ascending: false }).limit(1);
    const last = (lastRows as Record<string, unknown>[] | null)?.[0] || {};
    const picked = a.vehicle_id ? truckById.get(a.vehicle_id) : undefined;
    const usual = usualTruck.get(p.id);

    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(defaults)) {
      // The form's "customer" is the business; the table's customer_id is a login.
      const key = k === 'customer_id' ? 'business_id' : k;
      row[key] = NUMERIC.has(key) ? Number(v) : v;
    }
    Object.assign(row, {
      order_id: order.id,
      job_date: jobDate,
      material: order.tonnage_type || null,
      driver_name: name,
      unit_number: picked?.unit_number || usual?.unit_number || order.unit_number || (last.unit_number as string) || null,
      plate_number: picked?.plate || usual?.plate || (last.plate_number as string) || null,
      truck_type: (last.truck_type as string) || null,
      truck_type_tons: (last.truck_type_tons as number) ?? null,
      trucking_company: (last.trucking_company as string) || null,
      status: 'draft',
      submitted_by: p.id,
      assigned_to: p.id,
    });

    const finalRow = await withOrderMismatch(db, row, null);
    const { data: wo, error } = await db.from('work_orders').insert(finalRow).select('id').single();
    if (error || !wo) { skipped.push({ driver: name, reason: error?.message || 'could not make the ticket' }); continue; }
    sent.push({ driver: name, ticket_id: (wo as { id: string }).id });
    alreadyOn.add(p.id);

    // Tell them. Best-effort: the ticket is on their home screen either way.
    const when = new Date(`${jobDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    const title = `New job: ${order.job_name || (order.job_number ? `Job ${order.job_number}` : `Order #${order.order_number}`)}`;
    const text = [when, order.pickup_address ? `load at ${order.pickup_address}` : null, row.unit_number ? `truck ${row.unit_number}` : null]
      .filter(Boolean).join(' · ');
    const link = `/tickets/${(wo as { id: string }).id}`;
    try {
      await db.from('notifications').insert({ recipient_id: p.id, kind: 'job_assigned', title, body: text, link });
      await sendPushToUsers([p.id], { title, body: text, url: link });
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, sent, skipped });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const gate = await caller();
  if (gate.error) return gate.error;
  const me = gate.me!;
  if (!['admin', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ ok: false, error: 'only an admin can take a job back' }, { status: 403 });
  }
  const ticketId = new URL(req.url).searchParams.get('ticket') || '';
  const db = createAdminClient();
  const { data: wo } = await db.from('work_orders')
    .select('id, order_id, status, assigned_to, job_name, job_number, job_date').eq('id', ticketId).maybeSingle();
  const t = wo as { id: string; order_id: string | null; status: string; assigned_to: string | null; job_name: string | null; job_number: string | null; job_date: string | null } | null;
  if (!t || t.order_id !== params.id) return NextResponse.json({ ok: false, error: 'ticket not found on this order' }, { status: 404 });
  if (t.status !== 'draft') return NextResponse.json({ ok: false, error: 'that ticket is already in — open it instead' }, { status: 400 });
  const { count } = await db.from('work_order_loads').select('id', { count: 'exact', head: true }).eq('work_order_id', t.id);
  if ((count || 0) > 0) return NextResponse.json({ ok: false, error: 'the driver has already stamped loads on it' }, { status: 400 });

  const { error } = await db.from('work_orders').delete().eq('id', t.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (t.assigned_to) {
    const title = `Job taken off: ${t.job_name || (t.job_number ? `Job ${t.job_number}` : 'a job')}`;
    const text = t.job_date ? `For ${t.job_date}. Check with the office.` : 'Check with the office.';
    try {
      await db.from('notifications').insert({ recipient_id: t.assigned_to, kind: 'job_unassigned', title, body: text, link: '/tickets' });
      await sendPushToUsers([t.assigned_to], { title, body: text, url: '/tickets' });
    } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true });
}
