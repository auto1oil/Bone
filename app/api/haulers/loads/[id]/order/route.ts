// GET /api/haulers/loads/[id]/order — the job behind a load, for the hauling
// company it was sent to.
//
// Haulers cannot read job_orders: the customer's rate lives there and is
// Bone's business. But the rest of the order — where the job is, what hours
// it runs, what it hauls, the notes — is exactly what a company needs to
// decide whether to take the load. So this route hands over the job details
// with the money the hauler isn't party to left out: the customer rate and
// the fuel surcharge never leave here. Their own pay rate does.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Everything a hauler may see about the job. rate and fuel_surcharge are
// deliberately not in this list.
const SAFE_COLUMNS = [
  'id', 'order_number', 'business_id', 'job_name', 'job_number', 'phase_code', 'job_address',
  'start_date', 'end_date', 'start_time', 'stop_time', 'travel_hours', 'down_hours',
  'pay_rate', 'rate_unit', 'fsr', 'tonnage', 'tonnage_type', 'equipment_type', 'unit_number',
  'status', 'notes',
].join(', ');

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase
    .from('profiles').select('role, hauler_id').eq('id', user.id).single();

  const db = createAdminClient();
  const { data: load } = await db
    .from('hauler_loads').select('id, hauler_id, order_id').eq('id', params.id).maybeSingle();
  if (!load) return NextResponse.json({ ok: false, error: 'load not found' }, { status: 404 });

  const row = load as { hauler_id: string; order_id: string | null };
  const isStaff = ['office', 'admin', 'master_admin'].includes(actor?.role || '');
  if (!isStaff && actor?.hauler_id !== row.hauler_id) {
    return NextResponse.json({ ok: false, error: 'not your load' }, { status: 403 });
  }
  if (!row.order_id) return NextResponse.json({ ok: true, order: null });

  const { data: order } = await db
    .from('job_orders').select(SAFE_COLUMNS).eq('id', row.order_id).maybeSingle();
  if (!order) return NextResponse.json({ ok: true, order: null });

  // The customer's name is on the paper ticket as the contractor, so it is
  // not a secret; the rest of the customer record stays put.
  let customer: string | null = null;
  const o = order as unknown as { business_id: string | null };
  if (o.business_id) {
    const { data: b } = await db.from('businesses').select('name').eq('id', o.business_id).maybeSingle();
    customer = (b as { name: string } | null)?.name ?? null;
  }

  return NextResponse.json({ ok: true, order: { ...(order as unknown as Record<string, unknown>), customer } });
}
