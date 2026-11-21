// POST /api/work-orders/[id]/invoice — invoice an approved ticket.
// Office/admin only.
//
// Approval normally invoices the ticket in one step; this is the retry when
// that didn't land: QuickBooks was down or missing its item, or — on Bone's
// own invoices — the ticket had no customer or rate at that moment.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { invoiceWorkOrder } from '@/lib/work-orders';
import { createTicketInvoice, quickbooksConnected } from '@/lib/invoices';
import { invoiceLabel } from '@/lib/invoice-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!actor || !['office', 'admin', 'master_admin'].includes(actor.role)) {
    return NextResponse.json({ ok: false, error: 'office only' }, { status: 403 });
  }

  const db = createAdminClient();
  const { data: wo } = await db
    .from('work_orders')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (!wo) return NextResponse.json({ ok: false, error: 'work order not found' }, { status: 404 });
  if (!['office_approved', 'funds_approved'].includes((wo as { status: string }).status)) {
    return NextResponse.json({ ok: false, error: 'approve the ticket before invoicing it' }, { status: 400 });
  }

  if (await quickbooksConnected(db)) {
    const result = await invoiceWorkOrder(db, params.id);
    return NextResponse.json(result.body, { status: result.status });
  }
  const result = await createTicketInvoice(db, params.id, user.id);
  if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true, local: true,
    invoice_number: invoiceLabel(result.invoice.invoice_no),
    emailed: result.emailed, emailed_to: result.invoice.emailed_to, email_error: result.email_error,
  });
}
