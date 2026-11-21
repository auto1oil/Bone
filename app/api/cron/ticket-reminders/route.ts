// GET /api/cron/ticket-reminders — the "finish your haul ticket" nudge.
//
// Runs hourly. From 6 to 11 PM (yard time) every driver with a started
// ticket still open gets a push; at 6 AM the ones left open overnight get
// one more. Outside those hours it does nothing. Secured by CRON_SECRET.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { yardNow, dueForReminder, remindDriver, OPEN_TICKET_COLUMNS, type OpenTicket } from '@/lib/ticket-reminders';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const { day, hour } = yardNow();
  if (!((hour >= 18 && hour <= 23) || hour === 6)) return NextResponse.json({ ok: true, hour, reminded: 0, note: 'quiet hours' });
  try {
    const db = createAdminClient();
    const { data } = await db.from('work_orders').select(OPEN_TICKET_COLUMNS)
      .in('status', ['draft', 'rejected']).lte('job_date', day).limit(500);
    const due = ((data as unknown as OpenTicket[]) || []).filter((t) => dueForReminder(t, day, hour));
    let reminded = 0;
    for (const t of due) {
      // Not twice inside the same hour, whatever retries the scheduler makes.
      if (t.reminded_at && Date.now() - new Date(t.reminded_at).getTime() < 50 * 60_000) continue;
      if (await remindDriver(db, t)) reminded++;
    }
    return NextResponse.json({ ok: true, hour, open: due.length, reminded });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
