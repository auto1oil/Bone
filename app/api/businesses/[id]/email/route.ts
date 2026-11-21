// POST /api/businesses/[id]/email — set where a customer's invoices are
// emailed. Office and admin. Body: { email } ('' clears it).
//
// Its own route because the customer record is otherwise admin-only to
// edit: the office sends the invoices, so the office has to be able to fix
// the address they go to — and nothing else on the record.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { looksLikeEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!me || !['office', 'admin', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ ok: false, error: 'office or admin only' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email || '').trim();
  if (email && !looksLikeEmail(email)) {
    return NextResponse.json({ ok: false, error: 'that doesn’t look like an email address' }, { status: 400 });
  }
  const { error } = await createAdminClient().from('businesses').update({ email: email || null }).eq('id', params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, email: email || null });
}
