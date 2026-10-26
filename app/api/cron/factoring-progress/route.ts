// GET /api/cron/factoring-progress — every five minutes (vercel.json), push
// the live preview of every open ticket belonging to a company whose Auto 1
// Funding link is active. Unchanged tickets are skipped by hash, so this is
// cheap; it exists so a missed per-stamp ping never leaves the funding app
// looking at stale numbers.
//
// Secured by CRON_SECRET like the other crons: Vercel sends
// `Authorization: Bearer <CRON_SECRET>`.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sweepTicketProgress } from '@/lib/factoring';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  try {
    const result = await sweepTicketProgress(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'sweep failed' },
      { status: 502 },
    );
  }
}
