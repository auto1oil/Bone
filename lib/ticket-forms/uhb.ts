// Utah Home Building Company — their load sheet, as their pad prints it:
// the UHB mark and address, date / driver / truck on the right, customer and
// job lines, a twenty-row table with both pit and dump times, totals,
// comments, and the customer's box at the foot.

import { rgb } from 'pdf-lib';
import { Pen, RED, type FormData } from './kit';

export const ROWS = 20;

const FAINT = rgb(0.93, 0.93, 0.93);

// The axle count their form asks to be circled, when the truck type says it.
function axles(truckType: string): number | null {
  const m = truckType.match(/([3-7])\s*axle/i);
  return m ? Number(m[1]) : null;
}

export function draw(p: Pen, d: FormData) {
  const { font, bold } = p.f;

  // The big mark behind the table, faint as on the pad.
  p.page.drawEllipse({ x: 300, y: 470, xScale: 150, yScale: 150, borderColor: FAINT, borderWidth: 26 });
  p.center('UHB', 150, 450, 432, 104, bold, FAINT);

  // ---- Header ----
  p.page.drawEllipse({ x: 70, y: 737, xScale: 21, yScale: 21, borderColor: rgb(0, 0, 0), borderWidth: 4.5 });
  p.center('UHB', 49, 91, 731, 15, bold);
  p.text('UTAH HOME BUILDING', 100, 741, 11.5, bold);
  p.center('COMPANY', 100, 100 + p.width('UTAH HOME BUILDING', 11.5, bold), 728, 11.5, bold);
  p.v(226, 722, 752, 0.6);
  p.text('4682 S 150 West', 234, 746, 5.2, bold); p.text('Murray, UT 84107', 234, 740, 5.2, bold);
  p.text('office  801-268-9999', 234, 729, 5.2, bold);
  p.right(d.label, 512, 771, 13, bold, RED);
  if (d.continued) p.right('continued', 512, 762, 6.5, font);

  p.field('Date', 320, 418, 748, d.date, { size: 8.5 });
  // The day, ringed.
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((ch, i) => {
    const x = 432 + i * 14;
    p.text(ch, x, 749, 8);
    if (d.weekday !== null && (d.weekday + 6) % 7 === i) p.circle(x + p.width(ch, 8) / 2, 752, 5.5, 6);
  });
  p.field('Driver’s Name', 320, 522, 732, d.driver, { size: 8.5 });
  p.field('Truck', 320, 418, 715, d.truck, { size: 8.5 });
  p.field('Trailer', 422, 522, 715, '', { size: 8.5 });

  p.field('Customer', 40, 218, 693, d.customer, { size: 8.5 });
  p.field('Job Name', 222, 420, 695, d.jobName, { size: 8.5 });
  p.field('Job #', 424, 524, 697, d.jobNumber, { size: 8.5 });
  p.field('Job Address', 38, 272, 675, d.jobAddress, { size: 8.5 });
  p.field('Start Time', 276, 366, 677, d.start, { size: 8.5 });
  p.field('End Time', 370, 452, 679, d.end, { size: 8.5 });
  p.field('Hours', 456, 524, 681, d.continued ? '' : d.totalHours, { size: 8.5 });

  // ---- Loads ----
  const xs = [38, 56, 93, 130, 186, 226, 298, 370, 410, 452, 494, 560];
  const top = 664; const headH = 30; const rowH = 18;
  const g = p.grid(xs, top, headH, rowH, ROWS, 0.6);
  const heads: [string, string][] = [['#', ''], ['LOAD', 'IN'], ['LOAD', 'OUT'], ['TICKET #', ''], ['TONS', ''], ['PRODUCT', ''], ['SUPPLIER', ''], ['DUMP', 'IN'], ['DUMP', 'OUT'], ['FROM', ''], ['TO', '']];
  heads.forEach(([a, b], i) => {
    if (b) { p.center(a, xs[i], xs[i + 1], top - 11, 6, bold); p.center(b, xs[i], xs[i + 1], top - 19, 6, bold); }
    else p.center(a, xs[i], xs[i + 1], top - 12, 6, bold);
  });
  for (let i = 0; i < ROWS; i++) {
    const ry = g.rowY(i) + 6;
    p.center(String(i + 1), xs[0], xs[1], ry, 7.5);
    const l = d.loads[i];
    if (!l) continue;
    p.cell(l.loadIn, xs[1], xs[2], ry, 6.5);
    p.cell(l.loadOut, xs[2], xs[3], ry, 6.5);
    p.cell(l.ticket, xs[3], xs[4], ry, 7);
    p.cell(l.tons, xs[4], xs[5], ry, 7);
    p.cell(l.material || d.material, xs[5], xs[6], ry, 6.5, 'left');
    p.cell(d.pit, xs[6], xs[7], ry, 6, 'left');
    p.cell(l.unloadIn, xs[7], xs[8], ry, 6.5);
    p.cell(l.unloadOut, xs[8], xs[9], ry, 6.5);
    p.cell('Pit', xs[9], xs[10], ry, 6.5);
    p.cell(d.jobName || 'Job', xs[10], xs[11], ry, 6, 'left');
  }

  // ---- Signature, totals, comments ----
  const by = g.bottom;
  p.text('Driver’s Signature', 18, by - 24, 10, bold); p.h(122, 348, by - 25.5, 0.6);
  p.sig(d.driverSig, 128, by - 25.5, 160, 22);
  p.field('Total Loads', 350, 458, by - 22, d.continued ? '' : d.totalLoads, { size: 8.5 });
  p.field('Total Tons', 462, 560, by - 20, d.continued ? '' : d.totalTons, { size: 8.5 });
  const notes = p.wrap(d.notes, 470, 8, font, 5);
  p.field('Comments', 16, 566, by - 46, notes[0] || '', { size: 8.5 });
  for (let i = 1; i < 5; i++) p.onLine(14, 566, by - 46 - i * 17, notes[i] || '', 8);

  // ---- The customer's box ----
  p.rect(10, 58, 566, 60, { border: rgb(0.45, 0.45, 0.45), bw: 0.8 });
  p.field('Customer Name', 16, 274, 98, d.foremanName, { size: 8.5 });
  p.text('Customer Signature', 284, 100, 8.5); p.h(362, 570, 98.5, 0.6);
  p.sig(d.foremanSig, 368, 98.5, 150, 18);
  p.field('Time Out', 14, 238, 72, d.foremanTime || d.end, { size: 8.5 });
  p.check(250, 70, 9, d.signedOut === 'empty'); p.text('Empty', 263, 72, 8.5);
  p.check(318, 70, 9, d.signedOut === 'loaded'); p.text('Loaded', 331, 72, 8.5);
  p.text('Number of Axles', 400, 74, 8.5);
  const ax = axles(d.truckType);
  [3, 4, 5, 6, 7].forEach((n, i) => {
    const x = 478 + i * 16;
    p.text(String(n), x, 75, 8.5);
    if (ax === n) p.circle(x + 2.5, 78, 5.5, 6.5);
  });
}
