// POST /api/work-orders/[id]/remind — the office's "Remind now": send the
// driver the "finish your haul ticket" nudge for one open ticket, whatever
// the hour. Office and admin only.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { remindDriver, OPEN_TICKET_COLUMNS, type OpenTicket } from '@/lib/ticket-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!me || !['office', 'admin', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ ok: false, error: 'office or admin only' }, { status: 403 });
  }

  const db = createAdminClient();
  const { data } = await db.from('work_orders').select(`${OPEN_TICKET_COLUMNS}, status`).eq('id', params.id).maybeSingle();
  const t = data as unknown as (OpenTicket & { status: string }) | null;
  if (!t) return NextResponse.json({ ok: false, error: 'ticket not found' }, { status: 404 });
  if (!['draft', 'rejected'].includes(t.status)) {
    return NextResponse.json({ ok: false, error: 'that ticket is already in' }, { status: 400 });
  }
  const sent = await remindDriver(db, t, { from: 'from the office' });
  if (!sent) return NextResponse.json({ ok: false, error: 'could not reach the driver' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
