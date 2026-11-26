// One Source Materials — their Truck Tickets sheet, as their pad prints it:
// the OSM mark beside the name and address, the sub-hauler / customer / job
// block on the left with date, times and truck type on the right, twenty-
// five load lines in two columns, totals, notes, their terms and the two
// signatures.

import { rgb } from 'pdf-lib';
import { Pen, RED, type FormData } from './kit';

export const ROWS = 25;

const GREEN = rgb(0.25, 0.56, 0.22);
const STONE = rgb(0.58, 0.56, 0.53);
const WASH = rgb(0.9, 0.95, 0.89);

// Which of their eleven boxes a Bone truck type ticks.
function box(truckType: string): string {
  const t = truckType.toLowerCase();
  if (t.includes('double belly')) return 'DOUBLE BELLY';
  if (t.includes('belly')) return 'SINGLE BELLY';
  if (t.includes('double side')) return 'DOUBLE SIDE';
  if (t.includes('super side') || t.includes('ultra side')) return 'SUPER SIDE';
  if (t.includes('side')) return 'SINGLE SIDE';
  if (t.includes('pup')) return 'DUMP TRUCK & PUP';
  if (t.includes('strong arm')) return 'STRONG ARM (7 AXLE)';
  if (t.includes('dump')) return 'DUMP TRUCK';
  return '';
}

const TERMS =
  'This account is due and payable on the 15th of each month. If this account becomes delinquent, 15th of the following month, I or we, the undersigned agree to pay a FINANCE '
  + 'CHARGE AT THE RATE OF 2% PER MONTH WHICH IS 24% PER ANNUM, before and after judgment, until paid. That if account is placed in the hands of an attorney for '
  + 'collection, with or without suit, to pay a reasonable attorney’s fee.';
const DELIVERY =
  'DELIVERY TERMS AND CONDITIONS: We understand that loaded trucks can cause damage to concrete, landscaping, sprinkler system, and other items that may be on the '
  + 'property designated for delivery and I, therefore, specifically agree to hold OSM or its agent harmless for any damage by movement of the delivery vehicle while accessing or egressing '
  + 'the location I have designated for delivery.';

export function draw(p: Pen, d: FormData) {
  const { font, bold, serif } = p.f;

  // The pale mark behind the sheet.
  p.text('OSM', 150, 250, 190, bold, WASH);

  // ---- Header ----
  const o = p.width('O', 62, bold);
  p.text('O', 104, 690, 62, bold, STONE);
  p.text('SM', 104 + o - 2, 690, 62, bold, GREEN);
  let x = 104;
  for (const [word, color] of [['ONE', STONE], ['SOURCE', GREEN], ['MATERIALS', STONE]] as const) {
    p.text(word, x, 674, 9.5, bold, color); x += p.width(word, 9.5, bold);
  }
  p.center('TRUCK TICKETS', 240, 520, 752, 13);
  p.center('ONESOURCEMATERIALS', 240, 520, 732, 15, bold, GREEN);
  p.center('PO BOX 1053', 240, 520, 715, 11);
  p.center('SPRINGVILLE, UT 84664', 240, 520, 701, 11);
  p.center('OFFICE@ONESOURCEMATERIALS.COM', 240, 520, 687, 10.5);
  p.center('JASON@ONESOURCEMATERIALS.COM', 240, 520, 673, 10.5);
  p.right(d.label, 556, 736, 9.5, font, RED);
  if (d.continued) p.right('continued', 556, 727, 6.5, font);
  p.h(40, 538, 658, 1.6);

  // ---- Left: who it's for ----
  p.text('ARE YOU A SUB-HAULER FOR ONE SOURCE MATERIALS', 42, 642, 7.5, serif);
  p.text('IF SO WHAT IS THE NAME OF THE COMPANY YOU', 42, 628, 7.5, serif);
  p.field('ARE DRIVING FOR', 42, 275, 614, d.carrier, { size: 7.5, font: serif });
  p.field('CUSTOMER', 42, 275, 600, d.customer, { size: 7.5, font: serif });
  p.field('PIT or  DUMPSITE', 42, 275, 586, d.pit, { size: 7.5, font: serif });
  p.field('JOB NAME', 42, 275, 572, d.jobName, { size: 7.5, font: serif });
  p.field('JOB #', 42, 275, 558, [d.jobNumber, d.phase ? `Phase ${d.phase}` : ''].filter(Boolean).join('  '), { size: 7.5, font: serif });
  const addr = p.wrap(d.jobAddress, 160, 8, font, 2);
  p.field('JOB ADDRESS', 42, 275, 544, addr[0] || '', { size: 7.5, font: serif });
  p.onLine(105, 275, 530, addr[1] || '', 8);
  const notes = p.wrap(d.notes, 320, 7.5, font, 6);
  p.field('COMMENTS', 42, 275, 514, '', { size: 7.5, font: serif });

  // ---- Right: when, and what truck ----
  p.field('DATE', 298, 392, 642, d.date, { size: 7.5, font: serif });
  p.field('DRIVER', 396, 536, 642, d.driver, { size: 7.5, font: serif });
  p.text('CIRCLE ONE', 298, 628, 7.5, serif);
  let dx = 354;
  ['SUN', 'MON', 'TUES', 'WED', 'THUR', 'FRI', 'SAT'].forEach((name, i) => {
    const w = p.width(name, 7.5, serif);
    p.text(name, dx, 628, 7.5, serif);
    if (d.weekday === i) p.circle(dx + w / 2, 630.5, w / 2 + 3, 6);
    dx += w + 7;
  });
  const pair = (labelA: string, y: number, a: string, b: string) => {
    p.text(labelA, 298, y, 7.5, serif);
    p.text('START:', 362, y, 7.5, serif); p.onLine(394, 448, y, a, 8);
    p.text('END:', 452, y, 7.5, serif); p.onLine(474, 536, y, b, 8);
  };
  pair('TIME ON JOB', 614, d.start, d.end);
  pair('DRIVER TIME', 600, d.start, d.end);
  pair('LUNCH', 586, '', '');
  p.field('TRUCK#:', 298, 406, 572, d.truck, { size: 7.5, font: serif });
  p.field('TRAILER#:', 414, 536, 572, '', { size: 7.5, font: serif });
  const ticked = box(d.truckType);
  const cols: { x: number; tx: number; rows: [string, string][] }[] = [
    { x: 298, tx: 378, rows: [['DUMP TRUCK', '15-18'], ['STRONG ARM (4 AXLE)', '18-21'], ['STRONG ARM (7 AXLE)', '23-25'], ['SINGLE SIDE', '21-25'], ['SINGLE BELLY', '21-25']] },
    { x: 428, tx: 508, rows: [['SUPER SIDE (7 AXLE)', '25-28'], ['DUMP TRUCK & PUP', '28-32'], ['SUPER SIDE', '28-32'], ['DOUBLE SIDE', '35-38'], ['DOUBLE BELLY', '35-42'], ['TRANSPORT', '']] },
  ];
  for (const c of cols) {
    p.text('TRUCK TYPE', c.x + 6, 557, 7, serif); p.h(c.x + 6, c.x + 6 + p.width('TRUCK TYPE', 7, serif), 555.5, 0.5);
    p.text('TONNAGE', c.tx, 557, 7, serif); p.h(c.tx, c.tx + p.width('TONNAGE', 7, serif), 555.5, 0.5);
    c.rows.forEach(([name, tons], i) => {
      const y = 545 - i * 11.5;
      p.check(c.x, y - 0.5, 5.5, ticked === name, 0.6);
      p.text(name, c.x + 8, y, 6.6, serif);
      p.text(tons, c.tx + 4, y, 6.6, serif);
    });
  }
  p.v(422, 480, 562, 1.4);
  p.h(40, 538, 476, 1.6);

  // ---- Loads: 1–13 and 14–25 ----
  const tables: { xs: number[]; first: number; rows: number }[] = [
    { xs: [35, 62, 98, 162, 245, 283], first: 0, rows: 13 },
    { xs: [305, 332, 366, 428, 508, 545], first: 13, rows: 12 },
  ];
  const top = 466; const headH = 15; const rowH = 17.4;
  let leftBottom = 0;
  for (const t of tables) {
    const g = p.grid(t.xs, top, headH, rowH, t.rows, 0.8);
    if (t.first === 0) leftBottom = g.bottom;
    ['LOAD', 'TIME', 'MATERIAL', 'TICKET #', 'TONS'].forEach((hd, i) => p.center(hd, t.xs[i], t.xs[i + 1], top - 10.5, 6.5, serif));
    for (let i = 0; i < t.rows; i++) {
      const ry = g.rowY(i) + 5.5;
      p.center(String(t.first + i + 1), t.xs[0], t.xs[1], ry, 9, serif);
      const l = d.loads[t.first + i];
      if (!l) continue;
      p.cell(l.loadIn, t.xs[1], t.xs[2], ry, 6.2);
      p.cell(l.material || d.material, t.xs[2], t.xs[3], ry, 6.5, 'left');
      p.cell(l.ticket, t.xs[3], t.xs[4], ry, 7.5);
      p.cell(l.tons, t.xs[4], t.xs[5], ry, 7.2);
    }
  }

  // ---- Totals and notes ----
  const ty = leftBottom - 18;
  const totals: [string, string][] = [['TOTAL LOADS', d.totalLoads], ['TOTAL TONS', d.totalTons], ['TOTAL JOB HOURS', d.jobHours], ['TRAVEL TIME', d.travel]];
  totals.forEach(([name, v], i) => p.field(name, 22, 262, ty - i * 17, d.continued ? '' : v, { size: 10, font: serif, valueSize: 9.5 }));
  p.rect(294, ty - 58, 282, 78, { bw: 0.8 });
  p.field('Notes', 298, 568, ty + 4, notes[0] || '', { size: 10, font: serif, valueSize: 7.5 });
  for (let i = 1; i < 6; i++) p.onLine(298, 568, ty + 4 - i * 11.5, notes[i] || '', 7.5);

  // ---- Their terms ----
  let y = ty - 70;
  y = p.para(TERMS, 16, y, 562, 6.4, serif, 7.9);
  p.para(DELIVERY, 16, y, 562, 6.4, serif, 7.9);

  // ---- Signatures and copies ----
  p.text('Job Foremen’s Signature:', 312, 78, 7.5, serif); p.h(398, 566, 76.5, 0.6);
  p.sig(d.foremanSig, 402, 76.5, 150, 18);
  if (d.foremanName) p.right(d.foremanName, 564, 69, 6, font);
  p.text('Driver’s Signature:', 22, 68, 7.5, serif); p.h(88, 276, 66.5, 0.6);
  p.sig(d.driverSig, 92, 66.5, 150, 18);
  p.text('WHITE - One Source Materials', 86, 50, 7.5, serif);
  p.text('YELLOW - Customer Copy', 250, 56, 7.5, serif);
  p.text('PINK - Lessor', 455, 62, 7.5, serif);
}
