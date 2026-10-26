// POST /api/factoring/test — is this app connected to Auto 1 Funding?
//
// Admin only. Checks the SAVED endpoint, API key and source by asking the
// funding app's link-status endpoint about a made-up company; nothing is
// created over there. Server-side because the key never reaches a browser.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { testFactoringConnection } from '@/lib/factoring';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!actor || !['admin', 'master_admin'].includes(actor.role)) {
    return NextResponse.json({ ok: false, message: 'admin only' }, { status: 403 });
  }

  const result = await testFactoringConnection(createAdminClient());
  return NextResponse.json(result);
}
