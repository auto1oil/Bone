// The haul ticket as a PDF — laid out to mirror the Bone Trucking paper pad it
// replaced: the BONE header with the office address and dispatch line, the
// ticket number top right, the carrier/contractor/job block beside the
// day-of-week + driver/truck block, the two-column 28-row load table with the
// TYPE OF TRUCK check column, the totals and notes band, the finance and
// delivery terms, and the foreman/driver signature lines.
//
// Generated server-side when a ticket is approved/invoiced or shared, stored
// next to the ticket's photos in the work-tickets bucket, attached to the
// QuickBooks invoice, and linked in the factoring hand-off.
//
// Deliberately carries NO rates or dollar amounts — same as the paper form.
// The same document rides with the customer's invoice, the hauler's
// factoring packet, and whoever the driver texts it to.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { BRAND } from '@/lib/brand';
import { TRUCK_TYPES, MAX_LOADS } from '@/lib/truck-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  totalHours, onSiteHours, totalLoadTons, countLoads,
  type WorkOrder, type WorkOrderLoad,
} from '@/lib/work-orders';

const BUCKET = 'work-tickets';

const INK = rgb(0, 0, 0);
const GRAY = rgb(0.85, 0.85, 0.85);
const DIM = rgb(0.35, 0.35, 0.35);

const fmtClock = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const mer = h >= 12 ? 'PM' : 'AM';
  h = ((h + 11) % 12) + 1;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${mer}`;
};
const fmtStamp = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${fmtClock(iso)}`;
};
// A ticket's job_date is a plain YYYY-MM-DD; noon keeps the weekday right in
// every timezone.
const weekdayOf = (ymd: string | null): number | null => {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
};

// The terms printed along the bottom of every Bone pad (two typos on the
// printed pad — "count" for account, "form" for from — corrected).
const FINANCE_TERMS =
  'This account is due and payable on the 15th of each month. If the account becomes delinquent, 15th of the following month, '
  + 'I or we, the undersigned agree to pay a FINANCE CHARGE AT THE RATE OF 18% PER MONTH WHICH IS 216% PER ANNUM, before and after '
  + 'judgment, until paid. That if this account is placed in the hands of a attorney for collection, with or without suit, to pay a '
  + 'reasonable attorney\'s fee.';
const DELIVERY_TERMS = (co: string) =>
  'I understand that loaded trucks can cause damage to concrete, landscaping, sprinkler systems, and other items that may be on '
  + `property designated for delivery and I, therefore, specifically agree to hold ${co} and its agent harmless for any damage caused `
  + `by movement of the delivery vehicle while accessing or egressing the location I have designated delivery. ${co} will pay lessor `
  + 'within 10 days of receiving payment from contractor.';

// Build the PDF bytes for one ticket.
export async function buildTicketPdf(
  db: SupabaseClient,
  wo: WorkOrder,
  loads: WorkOrderLoad[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);

  const L = 36;   // outer box left
  const R = 576;  // outer box right

  const text = (s: string, x: number, y: number, size = 8, f: PDFFont = font, color = INK) => {
    if (s) page.drawText(s, { x, y, size, font: f, color });
  };
  const centered = (s: string, y: number, size: number, f: PDFFont, x1 = 0, x2 = 612) => {
    if (!s) return;
    const w = f.widthOfTextAtSize(s, size);
    text(s, x1 + (x2 - x1 - w) / 2, y, size, f);
  };
  const hline = (x1: number, x2: number, y: number, w = 0.7) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: w, color: INK });
  const vline = (x: number, y1: number, y2: number, w = 0.7) =>
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: w, color: INK });
  // A labeled fill-in line, the backbone of the paper form: bold label, a
  // rule, and the value written on it. Values are clipped to the line.
  const fill = (label: string, x: number, lineEnd: number, y: number, value: string | null, labelSize = 8.5, valueSize = 8.5) => {
    text(label, x, y, labelSize, bold);
    const lx = x + bold.widthOfTextAtSize(label, labelSize) + 3;
    hline(lx, lineEnd, y - 1.5);
    if (value) {
      let v = String(value);
      while (v.length > 1 && font.widthOfTextAtSize(v, valueSize) > lineEnd - lx - 4) v = v.slice(0, -1);
      text(v, lx + 2, y + 1, valueSize);
    }
    return lx;
  };
  // Word-wrap to a width, in a font and size, up to a line limit.
  const wrap = (s: string, width: number, size: number, f: PDFFont, maxLines: number): string[] => {
    const words = s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(cand, size) > width && line) {
        lines.push(line); line = w;
        if (lines.length >= maxLines) return lines;
      } else line = cand;
    }
    if (line && lines.length < maxLines) lines.push(line);
    return lines;
  };

  // Names the pad asks for that the ticket may only hold as ids.
  let carrier = wo.trucking_company;
  if (!carrier && wo.hauler_id) {
    const { data: h } = await db.from('haulers').select('name').eq('id', wo.hauler_id).maybeSingle();
    carrier = (h as { name: string } | null)?.name ?? null;
  }
  let contractor = wo.customer_number;
  if (!contractor && wo.customer_id) {
    const { data: c } = await db.from('profiles').select('business_name, full_name').eq('id', wo.customer_id).maybeSingle();
    const p = c as { business_name: string | null; full_name: string | null } | null;
    contractor = p?.business_name || p?.full_name || null;
  }

  // ---- Header (outside the box, like the paper) ----
  centered(BRAND.name.toUpperCase(), 736, 40, serif);
  centered(BRAND.addressLines.join('  ').toUpperCase(), 722, 8, bold);
  centered(`${BRAND.contactName} - ${BRAND.phone}`.toUpperCase(), 712, 8, bold);
  centered(`EMAIL: ${BRAND.officeEmail}`.toUpperCase(), 702, 8, bold);
  // Ticket number, top right, as the pad numbers its sheets.
  if (wo.ticket_number) {
    const tn = String(wo.ticket_number);
    text(tn, R - bold.widthOfTextAtSize(tn, 11) - 6, 738, 11, bold);
  }

  // ---- Outer box ----
  const boxTop = 692;
  const boxBottom = 40;
  page.drawRectangle({ x: L, y: boxBottom, width: R - L, height: boxTop - boxBottom, borderColor: INK, borderWidth: 1.2 });

  // ---- Top block: carrier/job on the left, day/driver/truck on the right ----
  const mid = 330;
  const rowStep = 15;
  const blockBottom = boxTop - (7 * rowStep + 8);
  vline(mid, blockBottom, boxTop);
  hline(L, R, blockBottom, 1);

  const lx = L + 8;
  let y = boxTop - 16;
  fill('CARRIER NAME', lx, mid - 8, y, carrier); y -= rowStep;
  fill('CONTRACTOR NAME', lx, mid - 8, y, contractor); y -= rowStep;
  fill('PIT ADDRESS', lx, mid - 8, y, wo.supplier); y -= rowStep;
  fill('JOB NAME', lx, mid - 8, y, wo.job_name); y -= rowStep;
  fill('JOB #', lx, mid - 8, y, [wo.job_number, wo.phase_code ? `Phase ${wo.phase_code}` : null].filter(Boolean).join('  ·  ')); y -= rowStep;
  fill('JOB ADDRESS', lx, mid - 8, y, wo.job_address); y -= rowStep;
  fill('MATERIAL', lx, mid - 8, y, wo.material);

  // Day of the week, the chosen one circled.
  const rx = mid + 8;
  let ry = boxTop - 16;
  const DAYS = ['SUN', 'MON', 'TUES', 'WED', 'THURS', 'FRI', 'SAT'];
  const dayW = (R - 8 - rx) / DAYS.length;
  const today = weekdayOf(wo.job_date);
  DAYS.forEach((d, i) => {
    const cx = rx + dayW * i + dayW / 2;
    const w = bold.widthOfTextAtSize(d, 10);
    text(d, cx - w / 2, ry, 10, bold);
    if (today === i) {
      page.drawEllipse({ x: cx, y: ry + 3.5, xScale: w / 2 + 5, yScale: 8, borderColor: INK, borderWidth: 1 });
    }
  });
  ry -= rowStep;
  fill('DATE', rx, R - 8, ry, wo.job_date); ry -= rowStep;
  fill('DRIVER', rx, R - 8, ry, wo.driver_name); ry -= rowStep;
  fill('TRUCK #', rx, R - 8, ry, wo.unit_number); ry -= rowStep;
  fill('PLATE #', rx, R - 8, ry, wo.plate_number); ry -= rowStep;
  // START / END is the driver's own clock, as on the pad. (Start Haul / End
  // Haul that bills is start_at / stop_at, shown under TRUCK HOURS below.)
  fill('START', rx, rx + 110, ry, fmtClock(wo.driver_start_at));
  fill('END', rx + 120, R - 8, ry, fmtClock(wo.driver_end_at));

  // ---- The load table: two columns of fourteen, truck types on the right ----
  const tableTop = blockBottom - 4;
  const headH = 13;
  const rowH = 20;
  const perColumn = MAX_LOADS / 2; // 14
  const tableBottom = tableTop - headH - perColumn * rowH;
  const truckColX = 458;
  // Within one load table: LOAD #, LOAD TIME, TICKET, TONS, MATERIAL.
  const colW = [24, 55, 49, 36, 47];
  const tableW = colW.reduce((a, b) => a + b, 0); // 211
  const tables = [L, L + tableW];
  const heads = ['LOAD #', 'LOAD TIME', 'TICKET', 'TONS', 'MATERIAL'];
  const byNo = new Map(loads.map((l) => [l.load_no, l]));

  hline(L, R, tableTop, 1);
  for (const tx of tables) {
    // Column edges for this table.
    const xs: number[] = [tx];
    for (const w of colW) xs.push(xs[xs.length - 1] + w);
    heads.forEach((h, i) => {
      const hs = i === 0 ? 5 : 6;
      const w = bold.widthOfTextAtSize(h, hs);
      text(h, xs[i] + (colW[i] - w) / 2, tableTop - 9, hs, bold);
    });
    hline(tx, tx + tableW, tableTop - headH);
    for (let i = 0; i < perColumn; i++) {
      const no = (tx === L ? 0 : perColumn) + i + 1;
      const rowY = tableTop - headH - (i + 1) * rowH;
      const l = byNo.get(no);
      const noS = String(no);
      text(noS, xs[0] + (colW[0] - bold.widthOfTextAtSize(noS, 11)) / 2, rowY + 5.5, 11, bold);
      if (l) {
        // LOAD TIME: when it loaded at the pit, with the unload time under it
        // in small type so the whole run still reads off the sheet.
        const inAt = fmtClock(l.load_in_at);
        const unl = fmtClock(l.unload_out_at || l.unload_in_at);
        if (inAt) text(inAt, xs[1] + 3, unl ? rowY + 10 : rowY + 6.5, 7.5);
        if (unl) text(`unl ${unl}`, xs[1] + 3, rowY + 2.5, 5.5, font, DIM);
        if (l.ticket_number) {
          let t = String(l.ticket_number);
          while (t.length > 1 && font.widthOfTextAtSize(t, 7.5) > colW[2] - 5) t = t.slice(0, -1);
          text(t, xs[2] + 3, rowY + 6.5, 7.5);
        }
        if (l.tons != null) text(Number(l.tons).toFixed(2), xs[3] + 3, rowY + 6.5, 7.5);
        if (l.material) {
          let m = String(l.material);
          while (m.length > 1 && font.widthOfTextAtSize(m, 6.5) > colW[4] - 5) m = m.slice(0, -1);
          text(m, xs[4] + 2.5, rowY + 6.5, 6.5);
        }
      }
      hline(tx, tx + tableW, rowY);
    }
    for (const x of xs) vline(x, tableBottom, tableTop);
  }

  // TYPE OF TRUCK column: every type on its own line with the tonnage range
  // under it, the chosen one marked.
  vline(truckColX, tableBottom, tableTop, 1);
  centered('TYPE OF TRUCK', tableTop - 9.5, 7, bold, truckColX, R);
  const chosen = (wo.truck_type || '').trim();
  const known = TRUCK_TYPES.some((t) => t.name === chosen);
  const slotH = (tableTop - headH - tableBottom) / (TRUCK_TYPES.length + 1); // +1 for Other
  TRUCK_TYPES.forEach((t, i) => {
    const sy = tableTop - headH - (i + 1) * slotH + 6;
    const isIt = chosen === t.name;
    const nameW = bold.widthOfTextAtSize(t.name, 7);
    const lineX1 = R - 36;
    text(t.name, lineX1 - 3 - nameW, sy, 7, bold);
    hline(lineX1, R - 6, sy - 1.5);
    if (isIt) {
      text('X', lineX1 + 10, sy, 9, bold);
      if (wo.truck_type_tons != null) text(`${wo.truck_type_tons}T`, lineX1 + 18, sy, 5.5, font, DIM);
    }
    if (t.tons) {
      const tw2 = font.widthOfTextAtSize(t.tons, 5);
      text(t.tons, lineX1 - 3 - tw2, sy - 6, 5, font, DIM);
    }
  });
  // "Other" catches a truck that isn't on the printed list.
  const oy = tableTop - headH - (TRUCK_TYPES.length + 1) * slotH + 6;
  fill('Other', truckColX + 6, R - 6, oy, chosen && !known ? chosen : '', 6.5, 6.5);

  // ---- Totals (left) and notes (right) ----
  const totalsBottom = tableBottom - 90;
  const totalsMid = 336;
  hline(L, R, tableBottom, 1);
  vline(totalsMid, totalsBottom, tableBottom, 1);
  hline(L, R, totalsBottom, 1);
  let ty = tableBottom - 17;
  const onSite = onSiteHours(wo.start_at, wo.stop_at);
  const span = wo.start_at || wo.stop_at ? `${fmtClock(wo.start_at)} – ${fmtClock(wo.stop_at)}` : '';
  const lastUnload = [...loads]
    .map((l) => l.unload_out_at || l.unload_in_at)
    .filter((v): v is string => !!v)
    .sort()
    .pop() || wo.sign_out_at;
  // Tons hauled isn't a line on the pad, but it's what a tonnage job bills
  // from, so it rides beside the load count.
  const tons = totalLoadTons(loads);
  const loadsS = countLoads(loads) ? `${countLoads(loads)}${tons > 0 ? `     (${tons.toFixed(2)} tons)` : ''}` : '';
  fill('TOTAL LOADS', lx, totalsMid - 8, ty, loadsS, 9, 9); ty -= 16;
  fill('TRUCK HOURS', lx, totalsMid - 8, ty, onSite > 0 ? `${onSite.toFixed(2)}${span ? `   (${span})` : ''}` : span, 9, 9); ty -= 16;
  fill('TRAVEL TIME', lx, totalsMid - 8, ty, wo.travel_hours != null ? `${wo.travel_hours} hrs` : '', 9, 9); ty -= 16;
  fill('TOTAL HOURS', lx, totalsMid - 8, ty, totalHours(wo) > 0 ? totalHours(wo).toFixed(2) : '', 9, 9); ty -= 16;
  fill('LAST LOAD UNLOADED', lx, totalsMid - 8, ty, fmtClock(lastUnload ?? null), 9, 9);

  const nx = totalsMid + 8;
  let ny = tableBottom - 17;
  text('NOTES', nx, ny, 9, bold);
  const notesLabelW = bold.widthOfTextAtSize('NOTES', 9) + 4;
  const notes = [wo.notes, wo.office_comments].filter(Boolean).join('  ·  ');
  // Wrapped to the first (shorter) ruled line so every line fits.
  const noteLines = notes ? wrap(notes, R - 8 - nx - notesLabelW - 4, 7, font, 4) : [];
  // First ruled line starts after the label; the rest run the full width.
  for (let i = 0; i < 4; i++) {
    const x1 = i === 0 ? nx + notesLabelW : nx;
    hline(x1, R - 8, ny - 1.5);
    if (noteLines[i]) text(noteLines[i], x1 + 2, ny + 1, 7);
    ny -= 16;
  }

  // ---- Office use band — what the office actually bills, kept apart from
  // what the driver wrote (carried over from the Stallion workflow). ----
  const bandTop = totalsBottom;
  const bandBottom = bandTop - 28;
  page.drawRectangle({ x: L, y: bandBottom, width: R - L, height: bandTop - bandBottom, color: GRAY });
  text(`${BRAND.name} Office Use Only:`, L + 6, bandTop - 10, 8, bold);
  const oy2 = bandTop - 22;
  fill('Start Haul', lx, 150, oy2, fmtClock(wo.office_start_haul), 7.5, 7.5);
  fill('End Haul', 158, 260, oy2, fmtClock(wo.office_end_haul), 7.5, 7.5);
  fill('Travel Time', 268, 390, oy2, wo.office_travel_hours != null ? String(wo.office_travel_hours) : '', 7.5, 7.5);
  fill('Total Hrs Billed', 398, R - 10, oy2, wo.office_total_hours != null ? String(wo.office_total_hours) : '', 7.5, 7.5);

  // ---- Terms, as printed on the pad ----
  let py = bandBottom - 10;
  for (const line of wrap(FINANCE_TERMS, R - L - 16, 6, font, 4)) { text(line, L + 8, py, 6); py -= 7.5; }
  py -= 4;
  text('DELIVERY TERMS AND CONDITIONS', L + 8, py, 6, bold); py -= 7.5;
  for (const line of wrap(DELIVERY_TERMS(BRAND.legalName), R - L - 16, 6, font, 4)) { text(line, L + 8, py, 6); py -= 7.5; }

  // ---- Signatures ----
  const sy = 66;
  const sigImgW = 100; const sigImgH = 18;
  const fsx = fill("JOBS FOREMAN'S SIGNATURE", L + 10, 300, sy, '', 7.5);
  await drawSigOnLine(db, doc, page, wo.foreman_signature_path, fsx, sy, sigImgW, sigImgH);
  if (wo.foreman_signature_name) {
    text(`${wo.foreman_signature_name} · ${fmtStamp(wo.foreman_signature_signed_at)}`, fsx + 2, sy - 7, 5.5, font, DIM);
  }
  fill('TIME', 308, 378, sy, fmtClock(wo.foreman_signature_signed_at || wo.sign_out_at), 7.5);
  const dsx = fill("DRIVER'S SIGNATURE", 386, R - 8, sy, '', 7.5);
  await drawSigOnLine(db, doc, page, wo.signature_path, dsx, sy, sigImgW, sigImgH);
  if (wo.signature_name) {
    text(`${wo.signature_name} · ${fmtStamp(wo.signature_signed_at)}`, dsx + 2, sy - 7, 5.5, font, DIM);
  }

  // ---- Footer line, as printed on the pads ----
  centered('WHITE - BILLING      YELLOW - TRUCK COPY', boxBottom + 5, 7.5, bold);

  return doc.save();
}

// A signature PNG drawn sitting on its fill-in line. Missing or unreadable
// just leaves the line — a PDF that fails over a signature fetch helps
// nobody.
async function drawSigOnLine(
  db: SupabaseClient,
  doc: PDFDocument,
  page: PDFPage,
  sigPath: string | null,
  x: number,
  lineY: number,
  maxW: number,
  maxH: number,
) {
  if (!sigPath) return;
  try {
    const { data } = await db.storage.from(BUCKET).download(sigPath);
    if (!data) return;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const img: PDFImage = await doc.embedPng(bytes);
    const s = Math.min(maxW / img.width, maxH / img.height);
    page.drawImage(img, { x: x + 4, y: lineY - 2, width: img.width * s, height: img.height * s });
  } catch { /* line stays blank */ }
}

// Generate (or regenerate) the ticket's PDF, store it next to the ticket's
// photos, and remember the path on the row. Returns the storage path, or null
// when generation failed — callers treat that like any other best-effort miss.
export async function ensureTicketPdf(
  db: SupabaseClient,
  workOrderId: string,
): Promise<{ path: string; bytes: Uint8Array } | null> {
  try {
    const [{ data: row }, { data: loadRows }] = await Promise.all([
      db.from('work_orders').select('*').eq('id', workOrderId).maybeSingle(),
      db.from('work_order_loads').select('*').eq('work_order_id', workOrderId).order('load_no'),
    ]);
    if (!row) return null;
    const wo = row as WorkOrder;
    const bytes = await buildTicketPdf(db, wo, (loadRows as WorkOrderLoad[]) || []);

    const pdfPath = `work-orders/${workOrderId}/haul-ticket.pdf`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(pdfPath, bytes as unknown as ArrayBuffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) return null;
    await db.from('work_orders').update({ ticket_pdf_path: pdfPath }).eq('id', workOrderId);
    return { path: pdfPath, bytes };
  } catch {
    return null;
  }
}
