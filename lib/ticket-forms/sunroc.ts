// Sunroc — their Lease Truck Time Card, as their pad prints it: the title
// across the top with the Sunroc mark at the right, company / driver / job
// on the left with date, truck and job number beside them, the "circle as
// applicable" box (day, shift, truck type), a seventeen-row load table with
// a shaded head, four boxes for the day's times, and the two signatures.

import { rgb } from 'pdf-lib';
import { Pen, RED, type FormData } from './kit';

export const ROWS = 17;

const DARK = rgb(0.2, 0.2, 0.2);
const SHADE = rgb(0.8, 0.8, 0.8);

// Which of their ten truck types a Bone truck type rings.
function kind(truckType: string): string {
  const t = truckType.toLowerCase();
  if (!t.trim()) return '';
  if (t.includes('pup')) return 'TRUCK & PUP';
  if (t.includes('double belly')) return 'DBL BELLY DUMP';
  if (t.includes('belly')) return 'BELLYDMP';
  if (t.includes('double side')) return 'DBL SIDE DUMP';
  if (t.includes('side')) return 'SIDE DUMP';
  if (t.includes('strong arm')) return 'STRONG ARM';
  if (t.includes('transfer')) return 'TRANSFER';
  if (t.includes('dump')) return 'END DUMP';
  return 'OTHER';
}

// Day or night, from when the truck started: a start between 4 in the
// morning and 4 in the afternoon is the day shift.
function shift(start: string): 'Day' | 'Night' | '' {
  const m = start.match(/^(\d{1,2}):\d{2}\s*(AM|PM)$/i);
  if (!m) return '';
  const h = (Number(m[1]) % 12) + (m[2].toUpperCase() === 'PM' ? 12 : 0);
  return h >= 4 && h < 16 ? 'Day' : 'Night';
}

export function draw(p: Pen, d: FormData) {
  const { font, bold, boldItalic } = p.f;

  // ---- Number, title, mark ----
  p.right(d.label, 566, 764, 13, font, RED);
  if (d.continued) p.right('continued', 566, 754, 6.5, font);
  const title = 'LEASE TRUCK TIME CARD';
  p.text(title, 34, 703, 326 / p.width(title, 1, bold), bold, DARK);

  // The Sunroc mark: a sun rising over the boxed name.
  p.page.drawSvgPath('M -27 0 A 27 21 0 0 1 27 0 Z', { x: 514, y: 727, color: DARK });
  p.page.drawSvgPath('M -18 0 A 18 13 0 0 1 18 0', { x: 514, y: 727, borderColor: rgb(1, 1, 1), borderWidth: 1.6 });
  p.page.drawSvgPath(
    'M 5 0 H 91 A 5 5 0 0 1 96 5 V 19 A 5 5 0 0 1 91 24 H 5 A 5 5 0 0 1 0 19 V 5 A 5 5 0 0 1 5 0 Z',
    { x: 466, y: 727, color: rgb(1, 1, 1), borderColor: DARK, borderWidth: 1.8 },
  );
  p.center('SUNROC', 466, 562, 709, 17.5, bold, DARK);

  // ---- Who, when ----
  p.text('“PRINT ONLY PLEASE”', 32, 665, 7, boldItalic, DARK);
  const rows3: [string, string, string, string][] = [
    ['COMPANY NAME', d.carrier, 'DATE', d.date],
    ['DRIVER NAME', d.driver, 'TRUCK #', d.truck],
    ['JOB NAME/ADDRESS', [d.jobName, d.jobAddress].filter(Boolean).join(' · '), 'JOB #', d.jobNumber],
  ];
  rows3.forEach(([la, va, lb, vb], i) => {
    const y = 647 - i * 21.5;
    p.field(la, 32, 244, y, va, { size: 7.5, valueSize: 8.5 });
    p.text(lb, 250, y, 7.5);
    p.onLine(290, 362, y, vb, 8.5);
  });

  // ---- Circle as applicable ----
  p.text('CIRCLE AS APPLICABLE', 368, 675, 7.5, boldItalic, DARK);
  p.rect(368, 606, 198, 64, { bw: 0.9, border: DARK });
  let x = 374;
  ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach((name, i) => {
    const w = p.width(name, 8.5);
    p.text(name, x, 654, 8.5, font, DARK);
    if (d.weekday === i) p.circle(x + w / 2, 657, w / 2 + 2.2, 6);
    x += w + 4.2;
  });
  x += 3;
  p.text('SHIFT:', x, 654, 8.5, font, DARK); x += p.width('SHIFT:', 8.5) + 3;
  const worked = d.continued ? '' : shift(d.start);
  for (const name of ['Day', 'Night'] as const) {
    const w = p.width(name, 8.5);
    p.text(name, x, 654, 8.5, font, DARK);
    if (worked === name) p.circle(x + w / 2, 657, w / 2 + 2.5, 6);
    x += w + 4;
  }
  const ringed = kind(d.truckType);
  const kinds: [string, string[]][][] = [
    [['10 WHEEL', ['10 WHEEL']], ['TRUCK & PUP', ['TRUCK &', 'PUP']], ['END DUMP', ['END DUMP']], ['BELLYDMP', ['BELLYDMP']], ['DBL BELLY DUMP', ['DBL BELLY', 'DUMP']]],
    [['SIDE DUMP', ['SIDE DUMP']], ['DBL SIDE DUMP', ['DBL SIDE', 'DUMP']], ['STRONG ARM', ['STRONG', 'ARM']], ['TRANSFER', ['TRANSFER']], ['OTHER', ['OTHER']]],
  ];
  const cx = [390, 429, 468, 509, 547];
  kinds.forEach((row, r) => {
    const cy = 637 - r * 19;
    row.forEach(([name, lines], i) => {
      if (lines.length === 2) {
        p.center(lines[0], cx[i] - 20, cx[i] + 20, cy + 1.5, 5, font, DARK);
        p.center(lines[1], cx[i] - 20, cx[i] + 20, cy - 4.5, 5, font, DARK);
      } else p.center(lines[0], cx[i] - 20, cx[i] + 20, cy - 1.5, 5, font, DARK);
      if (ringed === name) p.circle(cx[i], cy, 17.5, 8.5);
    });
  });

  // ---- Loads ----
  const xs = [30, 64, 142, 222, 256, 334, 412, 574];
  const top = 578; const headH = 20; const rowH = 21.5;
  p.rect(xs[0], top - headH, xs[xs.length - 1] - xs[0], headH, { fill: SHADE });
  const g = p.grid(xs, top, headH, rowH, ROWS, 0.8);
  ['LOAD#', 'PIT/PLANT', 'MATERIAL', 'TONS', 'TICKET NUMBER', 'LOAD TIME', 'COMMENTS']
    .forEach((hd, i) => p.text(hd, xs[i] + 3.5, top - headH + 4, 6.5, font, DARK));
  // The day's note goes in the comments of the first free rows.
  const note = d.continued ? [] : p.wrap(d.notes, xs[7] - xs[6] - 8, 7);
  for (let i = 0; i < ROWS; i++) {
    const ry = g.rowY(i) + 7;
    p.center(String(i + 1), xs[0], xs[1], ry, 7.5, font, DARK);
    const l = d.loads[i];
    if (!l) {
      const line = note[i - d.loads.length];
      if (line) p.cell(line, xs[6], xs[7], ry, 7, 'left');
      continue;
    }
    p.cell(d.pit, xs[1], xs[2], ry, 6.5, 'left');
    p.cell(l.material || d.material, xs[2], xs[3], ry, 7, 'left');
    p.cell(l.tons, xs[3], xs[4], ry, 7.5);
    p.cell(l.ticket, xs[4], xs[5], ry, 7.5);
    p.cell(l.loadIn, xs[5], xs[6], ry, 7.5);
    // A full sheet has no free row: the note rides on the last load's line.
    if (i === ROWS - 1 && d.loads.length === ROWS && note.length) p.cell(d.notes, xs[6], xs[7], ry, 6.5, 'left');
  }

  // ---- The day's times ----
  const boxes: { label: string[]; x: number; w: number; v: string }[] = [
    { label: ['CALL OUT TIME'], x: 30, w: 118, v: d.start },
    { label: ['LAST LOAD DUMP TIME'], x: 190, w: 116, v: d.end },
    { label: ['LUNCH'], x: 343, w: 44, v: '' },
    { label: ['TOTAL', 'HOURS'], x: 528, w: 46, v: d.totalHours },
  ];
  for (const b of boxes) {
    b.label.forEach((line, i) => p.center(line, b.x, b.x + b.w, 151 + (b.label.length - 1 - i) * 9, 7.5, font, DARK));
    p.rect(b.x, 123, b.w, 23, { bw: 0.9, border: DARK });
    if (!d.continued) p.center(p.fit(b.v, b.w - 6, 10), b.x, b.x + b.w, 130.5, 10);
  }

  // ---- Signatures ----
  p.text('DRIVER SIGNATURE', 58, 84, 7.5, font, DARK); p.h(182, 494, 82.5, 0.6);
  p.sig(d.driverSig, 190, 82.5, 180, 24);
  p.text('JOB FOREMAN SIGNATURE', 58, 46, 7.5, font, DARK); p.h(184, 494, 44.5, 0.6);
  p.sig(d.foremanSig, 190, 44.5, 180, 24);
  if (d.foremanName) p.text([d.foremanName, d.foremanTime].filter(Boolean).join(' · '), 498, 46, 6.5, font, DARK);
}
