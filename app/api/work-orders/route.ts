// GET  /api/work-orders — list tickets the caller is allowed to see.
// POST /api/work-orders — create a ticket (crew, office, admin).
//
// Reads go through the caller's own session so RLS decides what they see:
// crew see their own, contractors their crews', the funder every ticket, and
// office/admin everything. Writes are narrowed to the editable columns here so
// a client can never set a status or an approval stamp by posting it.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { pickEditable } from '@/lib/work-orders';
import { loadOrder, jobPickProblem, jobFacts, noJobFacts, finishProblem } from '@/lib/ticket-rules';
import { withOrderMismatch } from '@/lib/order-match';
import { createAdminClient } from '@/lib/supabase-admin';
import { checkFactoringLink } from '@/lib/factoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CREATORS = ['driver', 'mechanic', 'contractor', 'hauler', 'office', 'admin', 'master_admin'];

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const jobNumber = url.searchParams.get('job_number');
  const mine = url.searchParams.get('mine') === '1';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

  let query = supabase
    .from('work_orders')
    .select('*')
    .order('job_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // `status` accepts a comma-separated list so a screen can ask for one bucket
  // ("submitted") or a stage of the chain ("office_approved,funds_approved").
  if (status) {
    const wanted = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (wanted.length > 1) query = query.in('status', wanted);
    else if (wanted.length === 1) query = query.eq('status', wanted[0]);
  }
  if (jobNumber) query = query.eq('job_number', jobNumber);
  // "Mine" means both the tickets someone started and the ones handed to
  // them. A hauler's dispatcher opens the ticket and assigns a driver, so
  // filtering on who created it would leave that driver's list empty.
  if (mine) query = query.or(`submitted_by.eq.${user.id},assigned_to.eq.${user.id}`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, work_orders: data || [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase
    .from('profiles')
    .select('role, hauler_id')
    .eq('id', user.id)
    .single();
  if (!actor || !CREATORS.includes(actor.role)) {
    return NextResponse.json({ ok: false, error: 'not allowed to create tickets' }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty ticket is fine — it's a draft */ }

  const row = pickEditable(body);
  const submit = body.submit === true;

  // A ticket filed by anyone at a hauling company — the dispatcher or one of
  // their drivers — belongs to that company, whatever the client posted. It's
  // what scopes the row, and RLS refuses the insert outright if it's missing
  // or someone else's.
  if (actor.hauler_id) row.hauler_id = actor.hauler_id;

  // Factor Payment only stands while the company's Auto 1 Funding link does
  // — checked live, since the factoring side can switch it off any time.
  if (row.payment_method === 'factor' && actor.hauler_id) {
    const link = await checkFactoringLink(createAdminClient(), actor.hauler_id);
    if (link.status !== 'linked') row.payment_method = 'standard';
  }

  // ---- Bone's own crew (a lessor's crew gets its job through a load) ----
  const isOffice = ['office', 'admin', 'master_admin'].includes(actor.role);
  if (!isOffice && !actor.hauler_id) {
    // One open ticket a day: a second tap on Start hands back the one
    // that's already open (the office may have sent it) instead of making
    // a duplicate.
    const day = (row.job_date as string) || new Date().toISOString().slice(0, 10);
    row.job_date = day;
    if (!submit) {
      const { data: open } = await supabase.from('work_orders').select('*')
        .eq('submitted_by', user.id).eq('status', 'draft').eq('job_date', day)
        .order('created_at', { ascending: false }).limit(1);
      const existing = (open as Record<string, unknown>[] | null)?.[0];
      if (existing) return NextResponse.json({ ok: true, work_order: existing, existing: true });
    }
    // The job is optional to start. When one is picked it has to be open and
    // running that day, and its facts — the rate above all — come from the
    // order, never from the request.
    if (row.order_id) {
      const order = await loadOrder(createAdminClient(), row.order_id as string);
      const problem = jobPickProblem(order, day);
      if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
      Object.assign(row, jobFacts(order!));
      if (order!.ticket_format && !row.ticket_format) row.ticket_format = order!.ticket_format;
    } else {
      Object.assign(row, noJobFacts());
    }
    if (submit) {
      const problem = finishProblem(row as never, [], true);
      if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
    }
  } else if (row.order_id && !isOffice) {
    // A lessor's crew: travel is still the office's number for the job.
    const { data: ord } = await createAdminClient()
      .from('job_orders').select('travel_hours').eq('id', row.order_id as string).maybeSingle();
    row.travel_hours = (ord as { travel_hours: number | null } | null)?.travel_hours ?? null;
  }

  const finalRow = await withOrderMismatch(supabase, row, null);

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      ...finalRow,
      submitted_by: user.id,
      status: submit ? 'submitted' : 'draft',
      submitted_at: submit ? new Date().toISOString() : null,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, work_order: data });
}
