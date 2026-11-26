// Custom Trucking & Transportation LLC — their haul ticket, as their pad
// prints it: address block and name at the top, the truck-type tick boxes,
// company/customer/job on the left with date/pit/times on the right, an
// eighteen-row load table, totals, comments, their terms and the four
// signature lines.

import { rgb } from 'pdf-lib';
import { Pen, type FormData } from './kit';

export const ROWS = 18;

const TEAL = rgb(0.32, 0.6, 0.64);

// Which of their five boxes a Bone truck type ticks.
function box(truckType: string): string {
  const t = truckType.toLowerCase();
  if (t.includes('double side')) return 'DOUBLE SIDE DUMP';
  if (t.includes('super side') || t.includes('ultra side')) return 'SUPER SIDE DUMP';
  if (t.includes('side')) return 'SIDE DUMP';
  if (t.includes('belly')) return 'BELLY DUMP';
  if (t.includes('dump') || t.includes('strong arm') || t.includes('pup')) return 'DUMP TRUCK';
  return '';
}

const TERMS =
  'This invoice is due and payable thirty (30) days after the date listed above. If your account becomes past due, you agree to pay a finance charge at a '
  + 'rate of four percent (4%) per month, pro-rated, before and after any judgment, until paid. If an attorney is used for collection of your account, you '
  + 'agree to pay a thirty three percent (33%) collection fee and all attorneys’ fees, regardless of whether a lawsuit is filed. Returned checks do not '
  + 'postpone the payment due date for an invoice and will result in a five percent (5%) returned check fee being charged to your account. Any '
  + 'delinquent account is subject to a job/property lien or a claim against any applicable bond. If a lien is implemented or a claim is made against a '
  + 'bond, your account will be charged all costs per filed lien or claim.';

export function draw(p: Pen, d: FormData) {
  const { serif, serifBold, bold, boldItalic } = p.f;

  // ---- Header ----
  let y = 752;
  for (const line of ['6158 WEST  13400 SOUTH', 'HERRIMAN, UTAH   84096', '801-890-0088 OFFICE', '801-890-0433 FAX', '801-664-2980 DISPATCH']) {
    p.text(line, 70, y, 8, serif); y -= 10.5;
  }
  // The name, heavy and slanted as on the pad, over its underlined line.
  p.center('CUSTOM', 216, 404, 718.5, 46, boldItalic, rgb(0.08, 0.08, 0.08));
  p.center('CUSTOM', 214, 402, 720, 46, boldItalic, TEAL);
  p.center('TRUCKING & TRANSPORTATION LLC.', 214, 402, 704, 10.5, bold);
  p.h(222, 394, 701.5, 1);
  p.right(`# ${d.label}`, 548, 744, 13, bold);
  if (d.continued) p.right('continued', 548, 732, 7, serif);

  // ---- Truck type ----
  const kinds: [string, number][] = [['SIDE DUMP', 68], ['BELLY DUMP', 158], ['SUPER SIDE DUMP', 250], ['DUMP TRUCK', 364], ['DOUBLE SIDE DUMP', 452]];
  const ticked = box(d.truckType);
  for (const [name, x] of kinds) {
    p.text(name, x, 690, 8, serif);
    p.check(x + p.width(name, 8, serif) + 3, 688, 9, ticked === name);
  }

  // ---- Who and where ----
  const left: [string, string][] = [['COMPANY', d.carrier], ['TRUCK #', d.truck], ['CUSTOMER', d.customer], ['JOB NAME', d.jobName], ['PHASE +', d.phase]];
  const rightSide: [string, string][] = [['DATE', d.date], ['PIT', d.pit], ['JOB ADDRESS', d.jobAddress], ['ARRIVED AT PIT/ JOB', d.start], ['END AT PIT / JOB', d.end]];
  y = 652;
  for (let i = 0; i < 5; i++) {
    p.text(left[i][0], 75, y, 7.5, serif);
    p.onLine(130, 278, y, left[i][1], 8.5);
    p.right(rightSide[i][0], 392, y - 2, 7.5, serif);
    p.onLine(395, 540, y - 2, rightSide[i][1], 8.5);
    y -= 18;
  }

  // ---- Loads ----
  const xs = [72, 130, 180, 315, 352, 395, 545];
  const top = 552; const headH = 22; const rowH = 12.2;
  const g = p.grid(xs, top, headH, rowH, ROWS, 0.9);
  const heads: [string, string][] = [['LOAD', '#'], ['LOAD TIME', 'PIT/JOB'], ['MATERIAL', ''], ['TONS', 'HOURS'], ['LEAVE', 'PIT/JOB'], ['LOAD DESTINATION', 'PIT/JOB']];
  heads.forEach(([a, b], i) => {
    if (b) { p.center(a, xs[i], xs[i + 1], top - 9, 7, serif); p.center(b, xs[i], xs[i + 1], top - 18, 7, serif); }
    else p.center(a, xs[i], xs[i + 1], top - 13.5, 7, serif);
  });
  d.loads.slice(0, ROWS).forEach((l, i) => {
    const ry = g.rowY(i) + 3;
    p.cell(l.no, xs[0], xs[1], ry, 8);
    p.cell(l.loadIn, xs[1], xs[2], ry, 7.5);
    p.cell(l.material || d.material, xs[2], xs[3], ry, 7.5, 'left');
    p.cell(l.tons, xs[3], xs[4], ry, 7.5);
    p.cell(l.loadOut, xs[4], xs[5], ry, 7.5);
    p.cell(d.jobName || d.jobAddress, xs[5], xs[6], ry, 7.5, 'left');
  });

  // ---- Totals, comments ----
  const by = g.bottom;
  p.text('TOTAL TONS', 68, by - 22, 7.5, serif); p.onLine(128, 208, by - 22, d.continued ? '' : d.totalTons);
  p.text('TOTAL LOADS', 68, by - 40, 7.5, serif); p.onLine(128, 208, by - 40, d.continued ? '' : d.totalLoads);
  p.text('TRUCK HOURS', 68, by - 58, 7.5, serif); p.onLine(128, 208, by - 58, d.continued ? '' : d.jobHours);
  p.text('COMMENTS:', 252, by - 16, 7.5, serif);
  const notes = p.wrap(d.notes, 240, 8, p.f.font, 2);
  p.onLine(304, 548, by - 16, notes[0] || ''); p.onLine(304, 548, by - 36, notes[1] || '');
  p.text('TRAVEL:', 266, by - 54, 7.5, serif); p.onLine(304, 430, by - 54, d.travel);

  // ---- Their terms ----
  p.para(TERMS, 66, by - 84, 482, 7.6, serif, 10.4);

  // ---- Signatures ----
  const sy = by - 162;
  p.text('DRIVER’S SIGNATURE', 330, sy + 12, 7.5, serif); p.h(404, 548, sy + 10.5, 0.6);
  p.sig(d.driverSig, 408, sy + 10.5, 130, 20);
  p.text('CUSTOMER’S SIGNATURE', 66, sy, 7.5, serif); p.h(162, 304, sy - 1.5, 0.6);
  p.sig(d.foremanSig, 166, sy - 1.5, 130, 20);
  p.text('DRIVER’S PRINT', 330, sy - 20, 7.5, serif); p.onLine(392, 548, sy - 20, d.driver);
  p.text('CUSTOMER’S PRINT', 66, sy - 32, 7.5, serif); p.onLine(144, 300, sy - 32, d.foremanName);
  void serifBold;
}
