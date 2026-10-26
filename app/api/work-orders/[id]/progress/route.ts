// POST /api/work-orders/[id]/progress — refresh the funding app's live
// preview of this ticket. Pinged by the ticket form after a save and by the
// load lines after a stamp; the sweep in /api/cron/factoring-progress is the
// safety net.
//
// Server-side because the funding API key never reaches a browser, and
// because the decision of whether to send at all (linked company, open
// ticket, something changed) is not the browser's to make.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendTicketProgress } from '@/lib/factoring';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase
    .from('profiles').select('role, hauler_id').eq('id', user.id).single();

  const db = createAdminClient();
  const { data: wo } = await db
    .from('work_orders').select('id, hauler_id, submitted_by').eq('id', params.id).maybeSingle();
  if (!wo) return NextResponse.json({ ok: false, error: 'work order not found' }, { status: 404 });

  // The ticket's own people and the office.
  const row = wo as { hauler_id: string | null; submitted_by: string | null };
  const isStaff = ['office', 'admin', 'master_admin'].includes(actor?.role || '');
  const isTheirs = (!!actor?.hauler_id && actor.hauler_id === row.hauler_id) || row.submitted_by === user.id;
  if (!isStaff && !isTheirs) {
    return NextResponse.json({ ok: false, error: 'not your ticket' }, { status: 403 });
  }

  const result = await sendTicketProgress(db, params.id);
  return NextResponse.json(result);
}
