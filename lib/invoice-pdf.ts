// Bone's own invoice, as a PDF: one invoice page, then the haul ticket and
// its BOL photos behind it, so the customer's copy carries its own proof.

import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { BRAND } from '@/lib/brand';

export type InvoiceForPdf = {
  invoice_no: number;
  issued_on: string;
  due_on: string | null;
  customer_name: string | null;
  customer_address: string | null;
  job_name: string | null;
  job_number: string | null;
  ticket_label: string | null;
  job_date: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  rate: number;
  amount: number;
  status?: string;
};

export const invoiceLabel = (n: number | null | undefined) => (n == null ? '' : `INV-${n}`);

const INK = rgb(0.1, 0.1, 0.1);
const DIM = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.8, 0.8, 0.8);
const RED = rgb(0.56, 0.08, 0.08);

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (ymd: string | null) => (ymd
  ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : '');

// The pad's own terms: "due and payable on the 15th of each month".
export function dueDateFor(issuedOn: string): string {
  const d = new Date(`${issuedOn}T12:00:00`);
  const due = new Date(d.getFullYear(), d.getMonth() + 1, 15, 12);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

function wrap(s: string, maxW: number, size: number, f: PDFFont): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > maxW && line) { out.push(line); line = word; }
      else line = next;
    }
    out.push(line);
  }
  return out;
}

// `ticketPdf` is the haul ticket's own PDF (ticket page + BOL photos); its
// pages are appended. Left out, the invoice is the one page.
export async function buildInvoicePdf(inv: InvoiceForPdf, ticketPdf?: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const L = 48; const R = 564;
  const text = (s: string, x: number, y: number, size = 10, f: PDFFont = font, color = INK) => {
    if (s) page.drawText(s, { x, y, size, font: f, color });
  };
  const right = (s: string, xRight: number, y: number, size = 10, f: PDFFont = font, color = INK) => {
    if (s) text(s, xRight - f.widthOfTextAtSize(s, size), y, size, f, color);
  };
  const rule = (y: number, w = 0.8, color = RULE) => page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: w, color });

  // Who it's from, and what it is.
  text(BRAND.name.toUpperCase(), L, 728, 34, serif);
  let y = 712;
  for (const line of [BRAND.legalName, ...BRAND.addressLines, `${BRAND.contactName} · ${BRAND.phone}`, BRAND.officeEmail]) {
    text(line, L, y, 9, font, DIM); y -= 12;
  }
  right('INVOICE', R, 734, 22, bold, RED);
  right(invoiceLabel(inv.invoice_no), R, 714, 13, bold);
  right(`Date  ${longDate(inv.issued_on)}`, R, 698, 9.5);
  if (inv.due_on) right(`Due  ${longDate(inv.due_on)}`, R, 685, 9.5);
  if (inv.status === 'void') right('VOID', R, 664, 16, bold, RED);

  rule(646, 1.2, INK);

  // Bill to, and the job.
  text('BILL TO', L, 628, 8, bold, DIM);
  text(inv.customer_name || 'Customer', L, 613, 12, bold);
  y = 599;
  for (const line of wrap(inv.customer_address || '', 230, 9.5, font).slice(0, 3)) { text(line, L, y, 9.5); y -= 12; }

  text('JOB', 330, 628, 8, bold, DIM);
  text(inv.job_name || (inv.job_number ? `Job ${inv.job_number}` : '—'), 330, 613, 12, bold);
  y = 599;
  for (const line of [
    inv.job_name && inv.job_number ? `Job # ${inv.job_number}` : '',
    inv.ticket_label ? `Haul ticket ${inv.ticket_label}` : '',
    inv.job_date ? `Hauled ${longDate(inv.job_date)}` : '',
  ].filter(Boolean)) { text(line, 330, y, 9.5); y -= 12; }

  // The line.
  const top = 540;
  page.drawRectangle({ x: L, y: top - 6, width: R - L, height: 20, color: rgb(0.94, 0.94, 0.94) });
  text('DESCRIPTION', L + 8, top, 8, bold, DIM);
  right('QTY', 400, top, 8, bold, DIM);
  right('RATE', 478, top, 8, bold, DIM);
  right('AMOUNT', R - 8, top, 8, bold, DIM);
  y = top - 24;
  const desc = wrap(inv.description || 'Hauling', 290, 10, font).slice(0, 4);
  desc.forEach((line, i) => text(line, L + 8, y - i * 13, 10));
  right(`${Number(inv.quantity).toFixed(2)} ${inv.unit || ''}`.trim(), 400, y, 10);
  right(`${money(inv.rate)}${inv.unit ? `/${inv.unit.replace(/s$/, '')}` : ''}`, 478, y, 10);
  right(money(inv.amount), R - 8, y, 10);
  y -= Math.max(1, desc.length) * 13 + 8;
  rule(y);

  y -= 26;
  right('TOTAL DUE', 478, y, 11, bold);
  right(money(inv.amount), R - 8, y, 14, bold);

  // Terms, as the pad prints them.
  y -= 60;
  text('TERMS', L, y, 8, bold, DIM); y -= 13;
  const terms = 'This account is due and payable on the 15th of each month. If the account becomes delinquent, a finance charge '
    + 'at the rate of 18% per annum applies until paid.';
  for (const line of wrap(terms, R - L, 9, font)) { text(line, L, y, 9, font, DIM); y -= 11.5; }
  y -= 8;
  text(`Questions about this invoice: ${BRAND.phone} · ${BRAND.officeEmail}`, L, y, 9, font, DIM);
  if (ticketPdf) {
    y -= 20;
    text(`The haul ticket${inv.ticket_label ? ` ${inv.ticket_label}` : ''} and its scale tickets follow this page.`, L, y, 9, bold);
  }

  if (ticketPdf) {
    try {
      const src = await PDFDocument.load(ticketPdf);
      const pages = await doc.copyPages(src, src.getPageIndices());
      for (const p of pages) doc.addPage(p);
    } catch { /* the invoice page stands on its own */ }
  }
  return doc.save();
}
