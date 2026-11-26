// Whitaker Construction Company Inc — Driver Time Sheet / Load Count, as
// their pad prints it: the grey truck-information band, three load tables
// (A and C of eight rows, B of fifteen), misc time (D) and misc truck/EQ
// time (E), the hours total, the two signatures and the grey rate box the
// office fills in.

import { rgb } from 'pdf-lib';
import { Pen, type FormData, type FormLoad } from './kit';

// A (8) + C (8) + B (15).
export const ROWS = 31;

const BAND = rgb(0.8, 0.8, 0.8);

// Which of their six boxes a Bone truck type ticks.
function box(truckType: string): string {
  const t = truckType.toLowerCase();
  if (t.includes('double belly')) return 'Belly Dump & Pup';
  if (t.includes('belly')) return 'Single Belly Dump';
  if (t.includes('side')) return 'Side Dump';
  if (t.includes('pup')) return '12-Wheel & Pup';
  if (t.includes('dump') || t.includes('strong arm')) return '10-Wheel or 12-Wheel';
  return '';
}

export function draw(p: Pen, d: FormData) {
  const { font, bold, boldItalic } = p.f;

  // ---- Header ----
  p.text('WC', 68, 742, 40, boldItalic);
  p.text('PIPELINE', 142, 764, 5, bold); p.text('CONTRACTOR', 142, 758.5, 5, bold);
  p.text('w h i t a k e r', 72, 733, 6.5, font);
  p.center('Whitaker Construction Company Inc,', 190, 410, 762, 11, bold);
  p.center('Driver Time Sheet/Load Count', 190, 410, 749, 11, bold);
  p.text(d.label, 420, 763, 11, bold);
  if (d.continued) p.text('continued', 480, 763, 7, font);
  p.field('Date', 420, 525, 745, d.date, { size: 7 });
  p.field('Daily Rating', 400, 527, 729, '', { size: 7 });
  p.text('Injured on the job?', 380, 716, 7); p.check(460, 715, 8, false); p.text('No', 472, 716, 7); p.check(504, 715, 8, false); p.text('Yes', 516, 716, 7);
  p.field('Name', 62, 242, 702, d.driver, { size: 7 });
  p.field('Emp #', 275, 360, 710, '', { size: 7 });

  // ---- Truck information ----
  p.rect(45, 620, 500, 76, { fill: BAND, border: rgb(0.3, 0.3, 0.3), bw: 0.8 });
  p.text('Truck Information', 52, 684, 7.5, bold);
  p.field('Start:', 62, 120, 672, d.start, { size: 7 });
  p.field('Stop:', 132, 202, 676, d.end, { size: 7 });
  p.field('Lunch:', 58, 120, 659, '', { size: 7 });
  p.field('to:', 137, 202, 662, '', { size: 7 });
  p.field('Mileage Beginning', 62, 202, 640, '', { size: 7 });
  p.field('Ending', 97, 202, 628, '', { size: 7 });
  p.field('Truck #', 275, 362, 682, d.truck, { size: 7 });
  p.field('Trailer #', 378, 442, 685, '', { size: 7 });
  p.field('Pup #', 470, 538, 687, '', { size: 7 });
  p.text('Truck Type (Check One)', 290, 669, 7, bold);
  const ticked = box(d.truckType);
  const kinds: [string, number, number][] = [
    ['Single Belly Dump', 292, 656], ['10-Wheel or 12-Wheel', 292, 644], ['Semi End Dump', 292, 632],
    ['Belly Dump & Pup', 438, 660], ['12-Wheel & Pup', 438, 648], ['Side Dump', 438, 636],
  ];
  for (const [name, x, y] of kinds) { p.check(x, y - 1, 7, ticked === name); p.text(name, x + 11, y, 7); }

  // ---- The three load tables ----
  const jobLine = [d.jobName, d.jobNumber].filter(Boolean).join(' / ');
  function table(letter: string, x0: number, top: number, rows: number, rowH: number, loads: FormLoad[]) {
    // top is the y of the "Pit Name" line.
    p.field('Pit Name/or “On Site”', x0 - 12, x0 + 232, top, loads.length ? d.pit : '', { size: 7 });
    p.text('Job Name/No.', x0 + 18, top - 12, 7);
    p.text(p.fit(loads.length ? jobLine : '', 72, 6.5), x0 + 66, top - 12, 6.5);
    p.text('Phase Code', x0 + 142, top - 9, 7);
    p.text(p.fit(loads.length ? d.phase : '', 46, 6.5), x0 + 184, top - 9, 6.5);
    const xs = [x0 + 15, x0 + 58, x0 + 100, x0 + 143, x0 + 187, x0 + 232];
    const gTop = top - 16;
    const g = p.grid(xs, gTop, 10, rowH, rows, 0.8);
    p.text('Load', x0 - 4, gTop - 8, 6.5);
    ['Time In', 'Time Out', 'Mat.', 'Ticket #', 'Tons/Yards'].forEach((hd, i) => p.center(hd, xs[i], xs[i + 1], gTop - 8, 6.5));
    let tons = 0;
    for (let i = 0; i < rows; i++) {
      const ry = g.rowY(i) + (rowH - 6) / 2;
      p.right(String(i + 1), xs[0] - 3, ry, 7);
      const l = loads[i];
      if (!l) continue;
      p.cell(l.loadIn, xs[0], xs[1], ry, 6.8);
      p.cell(l.loadOut, xs[1], xs[2], ry, 6.8);
      p.cell(l.material || d.material, xs[2], xs[3], ry, 6, 'left');
      p.cell(l.ticket, xs[3], xs[4], ry, 6.5);
      p.cell(l.tons, xs[4], xs[5], ry, 6.8);
      tons += l.tonsN;
    }
    // Sub-totals under the last column.
    p.rect(xs[4], g.bottom - 13, xs[5] - xs[4], 13, { bw: 0.8 });
    p.rect(xs[4], g.bottom - 26, xs[5] - xs[4], 13, { bw: 0.8 });
    p.text('Sub-Totals', xs[2] + 4, g.bottom - 10, 7); p.right('Tons/Yards', xs[4] - 3, g.bottom - 9, 7);
    p.right('Hrs - Semi Total', xs[4] - 3, g.bottom - 22, 7);
    if (tons > 0) p.center(tons.toFixed(2), xs[4], xs[5], g.bottom - 10, 7);
    p.text(letter, xs[5] + 3, g.bottom - 22, 7);
    return g.bottom - 26;
  }
  table('A', 60, 604, 8, 11.5, d.loads.slice(0, 8));
  table('C', 314, 606, 8, 11.5, d.loads.slice(8, 16));
  const bBottom = table('B', 46, 446, 15, 14.4, d.loads.slice(16, 31));

  // ---- Misc time (D): the job's travel and any time waited ----
  p.text('Misc. Time', 326, 452, 7.5, bold);
  const dx = [326, 372, 416, 506, 552];
  const dg = p.grid(dx, 446, 12, 13, 3, 0.8);
  ['Job #', 'Phase', 'Description/EQ#', 'Hours'].forEach((hd, i) => p.center(hd, dx[i], dx[i + 1], 437, 7));
  const misc: [string, string][] = d.continued ? [] : ([['Travel', d.travel], ['Waiting', d.extra]] as [string, string][]).filter(([, v]) => v);
  misc.forEach(([what, v], i) => {
    const ry = dg.rowY(i) + 3.5;
    p.cell(d.jobNumber, dx[0], dx[1], ry, 6.5); p.cell(d.phase, dx[1], dx[2], ry, 6.5);
    p.cell(what, dx[2], dx[3], ry, 7, 'left'); p.cell(v, dx[3], dx[4], ry, 7);
  });
  p.rect(dx[3], dg.bottom - 13, dx[4] - dx[3], 13, { bw: 0.8 });
  p.right('Hrs - Semi Total', dx[3] - 3, dg.bottom - 9, 7); p.text('D', dx[4] + 3, dg.bottom - 9, 7);

  // ---- Misc truck / EQ time (E) ----
  p.text('Misc. Truck/EQ Time', 329, 372, 7.5, bold);
  const ex = [329, 378, 422, 512, 554];
  const eg = p.grid(ex, 366, 12, 13, 2, 0.8);
  ['Truck/EQ #', 'Cost Code', 'Description', 'Hours'].forEach((hd, i) => p.center(hd, ex[i], ex[i + 1], 357, 7));
  p.rect(ex[3], eg.bottom - 13, ex[4] - ex[3], 13, { bw: 0.8 });
  p.right('Hrs - Semi Total', ex[3] - 3, eg.bottom - 9, 7); p.text('E', ex[4] + 3, eg.bottom - 9, 7);

  // ---- Hours total, signatures ----
  p.field('Hours Total :', 422, 552, 293, d.continued ? '' : d.totalHours, { size: 8, font: bold, valueSize: 9 });
  p.text('Payroll Hours / Total of A,B,C,D, & E', 470, 284, 4.8);
  p.text('Driver’s Signature:', 335, 258, 8, bold); p.h(408, 554, 256.5, 0.6); p.sig(d.driverSig, 412, 256.5, 130, 20);
  p.text('Foreman Signature:', 337, 228, 8, bold); p.h(410, 556, 226.5, 0.6); p.sig(d.foremanSig, 414, 226.5, 130, 20);
  if (d.foremanName) p.right(d.foremanName, 554, 218, 6);

  // ---- The office's rate box ----
  p.rect(337, 130, 217, 78, { fill: BAND, border: rgb(0.3, 0.3, 0.3), bw: 0.8 });
  p.field('Truck Hours:', 341, 432, 192, d.continued ? '' : d.jobHours, { size: 7.5, valueSize: 8 });
  p.field('Truck Loads:', 470, 548, 198, d.continued ? '' : d.totalLoads, { size: 7.5, valueSize: 8 });
  p.h(337, 554, 172, 0.5); p.h(337, 554, 148, 0.5);
  p.text('Hrs', 360, 164, 5.5); p.text('x', 408, 176, 5.5); p.text('Rate', 450, 166, 5.5); p.text('=', 497, 178, 5.5); p.text('Amount', 522, 168, 5.5);
  p.text('Amt', 360, 139, 5.5); p.text('/', 408, 152, 5.5); p.text('Ton', 450, 141, 5.5); p.text('=', 497, 154, 5.5); p.text('Cost/Ton', 520, 143, 5.5);
  p.right('Revised 07-2011', 554, 122, 6);

  // ---- Comments ----
  const cy = Math.min(bBottom - 26, 172);
  p.text('Comments:', 46, cy, 8);
  const notes = p.wrap(d.notes, 240, 7.5, font, 3);
  p.onLine(90, 300, cy, notes[0] || '', 7.5); p.onLine(46, 300, cy - 18, notes[1] || '', 7.5); p.onLine(46, 300, cy - 36, notes[2] || '', 7.5);
}
