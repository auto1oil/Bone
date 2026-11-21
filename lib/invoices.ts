// Bone's own invoices: what "Send Invoice" does at the end of the audit
// while QuickBooks isn't connected.
//
// One invoice per haul ticket, numbered from a sequence (INV-<n>), with a
// PDF (the invoice page, then the ticket and its BOL photos), emailed to the
// customer's billing address. The amount is recomputed here from the ticket
// and the order — never taken from the browser — by the same calculation
// the QuickBooks path uses.
//
// The send is best-effort and never undoes the invoice: no email on file, no
// email service, a bounced send — the invoice still exists, says why it
// didn't go, and can be sent again from the Invoices tab.

import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAND } from '@/lib/brand';
import { resolveTicketBilling, ticketDescription, ticketLabel, type WorkOrder } from '@/lib/work-orders';
import { ensureTicketPdf } from '@/lib/ticket-pdf';
import { buildInvoicePdf, dueDateFor, invoiceLabel, type InvoiceForPdf } from '@/lib/invoice-pdf';
import { sendEmail, looksLikeEmail } from '@/lib/email';
import { yardNow } from '@/lib/ticket-reminders';

export type TicketInvoice = InvoiceForPdf & {
  id: string;
  work_order_id: string | null;
  order_id: string | null;
  business_id: string | null;
  pdf_path: string | null;
  emailed_to: string | null;
  emailed_at: string | null;
  email_error: string | null;
  status: 'open' | 'void';
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

const BUCKET = 'work-tickets';

// Is QuickBooks hooked up? When it is, invoicing stays with QuickBooks.
export async function quickbooksConnected(db: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await db.from('quickbooks_connection').select('*').eq('id', 1).maybeSingle();
    const c = data as { refresh_token?: string | null; access_token?: string | null } | null;
    return !!(c && (c.refresh_token || c.access_token));
  } catch {
    return false;
  }
}

export type InvoiceResult =
  | { ok: true; invoice: TicketInvoice; emailed: boolean; email_error: string | null }
  | { ok: false; error: string };

// Raise the invoice for one approved ticket, store its PDF, mark the ticket
// invoiced, and email the customer.
export async function createTicketInvoice(db: SupabaseClient, workOrderId: string, actorId: string | null): Promise<InvoiceResult> {
  const { data: row } = await db.from('work_orders').select('*').eq('id', workOrderId).maybeSingle();
  if (!row) return { ok: false, error: 'ticket not found' };
  const wo = row as WorkOrder;
  if (wo.invoice_no) return { ok: false, error: `already invoiced (${invoiceLabel(wo.invoice_no)})` };
  if (wo.qb_invoice_id) return { ok: false, error: `already invoiced in QuickBooks (#${wo.qb_invoice_number || wo.qb_invoice_id})` };

  const billing = await resolveTicketBilling(db, wo);
  if ('error' in billing) return { ok: false, error: billing.error };

  let customer: { name: string; address: string | null; email: string | null } | null = null;
  if (wo.business_id) {
    const { data: biz } = await db.from('businesses').select('name, address, email').eq('id', wo.business_id).maybeSingle();
    customer = (biz as typeof customer) ?? null;
  }
  if (!customer) return { ok: false, error: 'this ticket has no customer on it — put it on an order with a customer first' };

  const issuedOn = yardNow().day;
  const { data: created, error } = await db.from('ticket_invoices').insert({
    work_order_id: wo.id,
    order_id: wo.order_id,
    business_id: wo.business_id,
    customer_name: customer.name,
    customer_address: customer.address,
    job_name: wo.job_name,
    job_number: wo.job_number,
    ticket_label: ticketLabel(wo),
    job_date: wo.job_date,
    description: [ticketDescription(wo), wo.job_date ? `hauled ${wo.job_date}` : null, `ticket ${ticketLabel(wo)}`].filter(Boolean).join(' · '),
    quantity: billing.qty,
    unit: billing.unit,
    rate: billing.rate,
    amount: billing.amount,
    issued_on: issuedOn,
    due_on: dueDateFor(issuedOn),
    created_by: actorId,
  }).select('*').single();
  if (error || !created) {
    // The one-live-invoice index: someone else just invoiced it.
    return { ok: false, error: /duplicate|unique/i.test(error?.message || '') ? 'this ticket was just invoiced by someone else' : (error?.message || 'could not create the invoice') };
  }
  let invoice = created as TicketInvoice;

  await db.from('work_orders').update({ status: 'invoiced', invoice_no: invoice.invoice_no }).eq('id', wo.id);

  // The PDF. Best-effort: an invoice without its PDF can have it rebuilt.
  const pdf = await storeInvoicePdf(db, invoice);
  if (pdf) invoice = { ...invoice, pdf_path: pdf.path };

  const sent = await emailInvoice(db, invoice, customer.email, pdf?.bytes ?? null);
  return { ok: true, invoice: sent.invoice, emailed: sent.emailed, email_error: sent.error };
}

// Build the invoice PDF (invoice page + the ticket's own PDF) and store it.
export async function storeInvoicePdf(db: SupabaseClient, invoice: TicketInvoice): Promise<{ path: string; bytes: Uint8Array } | null> {
  try {
    const ticket = invoice.work_order_id ? await ensureTicketPdf(db, invoice.work_order_id) : null;
    const bytes = await buildInvoicePdf(invoice, ticket?.bytes ?? null);
    const path = `invoices/${invoiceLabel(invoice.invoice_no)}.pdf`;
    const { error } = await db.storage.from(BUCKET)
      .upload(path, bytes as unknown as ArrayBuffer, { contentType: 'application/pdf', upsert: true });
    if (error) return null;
    await db.from('ticket_invoices').update({ pdf_path: path }).eq('id', invoice.id);
    return { path, bytes };
  } catch {
    return null;
  }
}

// Email an invoice to the customer and record how it went on the row.
export async function emailInvoice(
  db: SupabaseClient,
  invoice: TicketInvoice,
  to: string | null | undefined,
  pdfBytes?: Uint8Array | null,
): Promise<{ invoice: TicketInvoice; emailed: boolean; error: string | null }> {
  const record = async (patch: Partial<TicketInvoice>) => {
    const { data } = await db.from('ticket_invoices').update(patch).eq('id', invoice.id).select('*').single();
    return (data as TicketInvoice) || { ...invoice, ...patch };
  };
  if (invoice.status === 'void') return { invoice, emailed: false, error: 'this invoice is void' };
  const addr = (to || '').trim();
  if (!looksLikeEmail(addr)) {
    const error = 'No email address on file for this customer. Add one and send it again.';
    return { invoice: await record({ email_error: error }), emailed: false, error };
  }

  let bytes = pdfBytes ?? null;
  if (!bytes && invoice.pdf_path) {
    try {
      const { data } = await db.storage.from(BUCKET).download(invoice.pdf_path);
      if (data) bytes = new Uint8Array(await data.arrayBuffer());
    } catch { /* rebuilt below */ }
  }
  if (!bytes) bytes = (await storeInvoicePdf(db, invoice))?.bytes ?? null;
  if (!bytes) {
    const error = 'The invoice PDF could not be built, so it wasn’t sent.';
    return { invoice: await record({ email_error: error }), emailed: false, error };
  }

  const label = invoiceLabel(invoice.invoice_no);
  const amount = `$${Number(invoice.amount).toFixed(2)}`;
  const job = invoice.job_name || (invoice.job_number ? `Job ${invoice.job_number}` : 'your job');
  const text = [
    `Hello,`,
    ``,
    `Attached is invoice ${label} from ${BRAND.legalName} for ${job}${invoice.job_date ? `, hauled ${invoice.job_date}` : ''}.`,
    ``,
    `Amount due: ${amount}${invoice.due_on ? `\nDue: ${invoice.due_on}` : ''}`,
    ``,
    `The haul ticket and its scale tickets are behind the invoice in the same PDF.`,
    ``,
    `Questions? Reply to this email or call ${BRAND.phone}.`,
    ``,
    `Thank you,`,
    BRAND.legalName,
  ].join('\n');
  const result = await sendEmail({
    to: addr,
    subject: `Invoice ${label} from ${BRAND.legalName} — ${amount}`,
    text,
    attachments: [{ filename: `${BRAND.name}-${label}.pdf`, content: bytes }],
  });
  if ('error' in result) {
    return { invoice: await record({ email_error: result.error }), emailed: false, error: result.error };
  }
  return {
    invoice: await record({ emailed_to: addr, emailed_at: new Date().toISOString(), email_error: null }),
    emailed: true,
    error: null,
  };
}
