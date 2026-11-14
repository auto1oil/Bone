// GET /api/admin/users/last-seen — when each login last signed in, from the
// app's own login log. Admin only; the log itself is master-admin-only to
// read directly, so this hands admins just the one fact per person.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'master_admin') {
    return NextResponse.json({ ok: false, error: 'admin only' }, { status: 403 });
  }

  // Newest first; the first row per user is their latest sign-in. A few
  // thousand rows covers months of a small company's logins.
  const db = createAdminClient();
  const { data } = await db.from('login_events').select('user_id, at').order('at', { ascending: false }).limit(5000);
  const last: Record<string, string> = {};
  for (const r of (data as { user_id: string | null; at: string }[]) || []) {
    if (r.user_id && !last[r.user_id]) last[r.user_id] = r.at;
  }
  return NextResponse.json({ ok: true, last });
}
