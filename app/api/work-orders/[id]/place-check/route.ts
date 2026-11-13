// POST /api/work-orders/[id]/place-check — re-run the place check for a
// ticket. Office/admin, from the audit panel and the ticket page.
//
// The check already runs after every stamp and every save; this is for the
// office looking at a ticket whose addresses were just corrected on the
// order, or one filed before the check existed.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { runPlaceCheck } from '@/lib/place-check';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!actor || !['office', 'admin', 'master_admin'].includes(actor.role)) {
    return NextResponse.json({ ok: false, error: 'office only' }, { status: 403 });
  }

  const result = await runPlaceCheck(createAdminClient(), params.id);
  if (!result) return NextResponse.json({ ok: false, error: 'could not check that ticket' }, { status: 404 });
  return NextResponse.json({ ok: true, place_check: result });
}
