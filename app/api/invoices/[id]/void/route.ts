// POST /api/invoices/[id]/void — void one of Bone's own invoices. Admin only,
// like every other invoice change. Body: { reason }.
//
// The number is never reused: the invoice stays on the list, marked void
// with who, when and why. Its ticket goes back to approved-not-invoiced so
// it can be corrected and invoiced again under a new number.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import type { TicketInvoice } from '@/lib/invoices';
import { logTicketEvent } from '@/lib/ticket-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role, full_name, email').eq('id', user.id).single();
  if (!me || !['admin', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ ok: false, error: 'only an admin can void an invoice' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason || '').trim();
  if (!reason) return NextResponse.json({ ok: false, error: 'say why it’s being voided' }, { status: 400 });

  const db = createAdminClient();
  const { data } = await db.from('ticket_invoices').select('*').eq('id', params.id).maybeSingle();
  const invoice = data as TicketInvoice | null;
  if (!invoice) return NextResponse.json({ ok: false, error: 'invoice not found' }, { status: 404 });
  if (invoice.status === 'void') return NextResponse.json({ ok: false, error: 'already void' }, { status: 400 });

  const { data: updated, error } = await db.from('ticket_invoices').update({
    status: 'void', voided_at: new Date().toISOString(), voided_by: user.id, void_reason: reason,
  }).eq('id', invoice.id).select('*').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // The ticket is approved but no longer invoiced.
  if (invoice.work_order_id) {
    await db.from('work_orders').update({ status: 'office_approved', invoice_no: null })
      .eq('id', invoice.work_order_id).eq('invoice_no', invoice.invoice_no);
    const { data: t } = await db.from('work_orders').select('id, ticket_no, job_name, job_number').eq('id', invoice.work_order_id).maybeSingle();
    if (t) {
      await logTicketEvent(db, t as { id: string; ticket_no: number | null; job_name: string | null; job_number: string | null },
        'invoice_voided', { id: user.id, name: me.full_name || me.email }, `INV-${invoice.invoice_no}: ${reason}`);
    }
  }
  return NextResponse.json({ ok: true, invoice: updated });
}
