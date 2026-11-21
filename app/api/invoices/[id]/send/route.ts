// POST /api/invoices/[id]/send — email one of Bone's own invoices to the
// customer (again, or for the first time if the first send didn't go).
// Office and admin. Body: { to?: string, remember?: boolean } — `to` sends
// it somewhere other than the address on file; `remember` saves that address
// as the customer's billing email.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { emailInvoice, type TicketInvoice } from '@/lib/invoices';
import { looksLikeEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!me || !['office', 'admin', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ ok: false, error: 'office or admin only' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { to?: string; remember?: boolean };
  const db = createAdminClient();
  const { data } = await db.from('ticket_invoices').select('*').eq('id', params.id).maybeSingle();
  const invoice = data as TicketInvoice | null;
  if (!invoice) return NextResponse.json({ ok: false, error: 'invoice not found' }, { status: 404 });
  if (invoice.status === 'void') return NextResponse.json({ ok: false, error: 'this invoice is void' }, { status: 400 });

  let to = (body.to || '').trim();
  if (to && !looksLikeEmail(to)) return NextResponse.json({ ok: false, error: 'that doesn’t look like an email address' }, { status: 400 });
  if (to && body.remember && invoice.business_id) {
    await db.from('businesses').update({ email: to }).eq('id', invoice.business_id);
  }
  if (!to && invoice.business_id) {
    const { data: biz } = await db.from('businesses').select('email').eq('id', invoice.business_id).maybeSingle();
    to = ((biz as { email: string | null } | null)?.email || '').trim();
  }

  const sent = await emailInvoice(db, invoice, to);
  if (!sent.emailed) return NextResponse.json({ ok: false, error: sent.error, invoice: sent.invoice }, { status: 400 });
  return NextResponse.json({ ok: true, invoice: sent.invoice });
}
