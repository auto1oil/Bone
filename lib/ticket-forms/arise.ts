// Arise Trucking — their delivery ticket (a wide half sheet): name and
// address top left, the acknowledgement box and customer lines top right,
// four job rows each with its T / TP / S / DS tick boxes, travel and total
// hours, three Ticket # / Weight tables, and their terms boxed at the foot.

import { Pen, type FormData } from './kit';

// Scale tickets the three little tables hold: six, five and five.
export const ROWS = 16;
export const PAGE: [number, number] = [612, 504];

// T = truck, TP = truck & pup, S = side dump, DS = double side.
function box(truckType: string): string {
  const t = truckType.toLowerCase();
  if (t.includes('double side')) return 'DS';
  if (t.includes('side')) return 'S';
  if (t.includes('pup')) return 'TP';
  if (t.includes('dump') || t.includes('strong arm')) return 'T';
  return '';
}

const TERMS =
  'TERMS OF DELIVERY and RELEASE OF RESPONSIBILITY: Our drivers make every effort to place materials where purchaser designates. However, prices are based '
  + 'on a readily accessible road to the point of discharge. ARISE TRUCKING assumes no responsibility for damage inside curb of property. We cannot accept '
  + 'responsibility for damage caused by our equipment to curb, gutters, sidewalks, driveways, lawns, trees or other personal property and Customer agrees to hold '
  + 'company harmless in this regard. All accounts are due on the 10th of the month following date of delivery. In the event that the payment is not made within 30 '
  + 'days after due date, customer agrees to pay a finance charge of 2% per month or 24% per annum and customer agrees to pay for any and all costs and expenses '
  + 'incurred by ARISE TRUCKING to collect all or any portion of said sums including, but not limited to, the filing of notices to owners, liens, court costs, attorney fees '
  + 'incurred whether for consultation, collection effort that does not include litigation, whether hourly or contingent but not to be less than 40% of the amount due '
  + 'if contingent. If customer has already signed as master account agreement, “Credit Application-Account Agreement” this delivery ticket shall not replace or '
  + 'modify the terms of the “Credit Application-Account Agreement” and the terms of the “Credit Application-Account” shall govern.';

export function draw(p: Pen, d: FormData) {
  const { font, bold, boldItalic, serif, serifItalic } = p.f;

  // ---- Name and address ----
  p.text('ARISE', 96, 458, 30, boldItalic);
  p.text('T R U C K I N G', 118, 448, 6.5, font);
  p.center('P.O. Box 1596 • Spanish Fork, UT 84660', 50, 232, 424, 7.5);
  p.center('Phone #: (801) 400-5719', 50, 232, 414.5, 7.5);
  p.center('Email: arisetruckingbilling@gmail.com', 50, 232, 405, 7.5);

  // ---- Number, acknowledgement, customer ----
  p.right(d.label, 520, 482, 10, serif);
  if (d.continued) p.right('continued', 520, 473, 6.5, serif);
  p.rect(258, 436, 286, 32, { bw: 0.8 });
  p.center('By signing this delivery ticket customer acknowledges', 258, 544, 457, 7.6, bold);
  p.center('receipt of goods listed in the amounts listed', 258, 544, 448, 7.6, bold);
  p.center('and at the dates and times listed.', 258, 544, 439, 7.6, bold);
  p.field('Customer Name:', 244, 566, 422, d.customer, { size: 8, font: bold });
  p.text('Customer Signature:', 244, 404, 8, bold); p.h(326, 566, 402.5, 0.6);
  p.sig(d.foremanSig, 332, 402.5, 150, 16);
  if (d.foremanName) p.right(d.foremanName, 564, 405, 6.5, font);

  p.field('Date:', 52, 232, 382, d.date, { size: 7.5, font: bold });
  p.field('Truck #:', 240, 366, 386, d.truck, { size: 7.5, font: bold });
  p.field('Driver Name:', 372, 566, 390, d.driver, { size: 7.5, font: bold });
  // Circle one: the day.
  const days = ['Mon.', 'Tues.', 'Wed.', 'Thur.', 'Fri.', 'Sat.', 'Sun.'];
  let dx = 52;
  days.forEach((name, i) => {
    const w = p.width(name, 7, bold);
    p.text(name, dx, 372, 7, bold);
    if (d.weekday !== null && (d.weekday + 6) % 7 === i) p.circle(dx + w / 2, 374.5, w / 2 + 2.5, 5.5);
    dx += w + 4;
  });
  p.text('Circle One', 100, 364, 7, bold);
  p.field('Company Name:', 190, 372, 368, d.carrier, { size: 7.5, font: bold });
  p.text('Driver Signature:', 380, 376, 7.5, bold); p.h(444, 566, 374.5, 0.6);
  p.sig(d.driverSig, 448, 374.5, 110, 14);

  // ---- Four job rows ----
  const xs = [52, 162, 216, 266, 314, 390, 462, 525, 570];
  const heads = ['Job Name/Site', 'Start Time', 'End Time', 'Job Hours', 'Type of Material', 'Material From', 'Delivered to', '# of Loads'];
  const ticked = box(d.truckType);
  let top = 362;
  for (let b = 0; b < 4; b++) {
    const headH = b === 0 ? 11 : 0;
    const rowH = b === 0 ? 17 : 22;
    const g = p.grid(xs, top, headH, rowH, 1, 0.8);
    if (b === 0) heads.forEach((hd, i) => p.center(hd, xs[i], xs[i + 1], top - 8.5, 6.8, bold));
    // The tick boxes beside the row.
    ['T', 'TP', 'S', 'DS'].forEach((k, i) => {
      const cy = top - 7 - i * 7;
      p.check(22, cy, 5.5, b === 0 && !d.continued && ticked === k, 0.6);
      p.text(k, 30, cy + 0.5, 5.5, font);
    });
    if (b === 0 && !d.continued) {
      const ry = g.rowY(0) + 5.5;
      p.cell(d.jobName || d.jobNumber, xs[0], xs[1], ry, 7.5, 'left');
      p.cell(d.start, xs[1], xs[2], ry, 7.5);
      p.cell(d.end, xs[2], xs[3], ry, 7.5);
      p.cell(d.jobHours, xs[3], xs[4], ry, 7.5);
      p.cell(d.material, xs[4], xs[5], ry, 7.5, 'left');
      p.cell(d.pit, xs[5], xs[6], ry, 7, 'left');
      p.cell(d.jobAddress, xs[6], xs[7], ry, 7, 'left');
      p.cell(d.totalLoads, xs[7], xs[8], ry, 8);
    }
    top = g.bottom - 7;
  }

  // ---- Travel, total hours, comments ----
  const ty = top - 2;
  p.rect(52, ty - 12, 286, 12, { bw: 0.8 }); p.v(290, ty - 12, ty, 0.8);
  p.center('Travel Time', 52, 290, ty - 9, 8, bold); p.center(d.continued ? '' : d.travel, 290, 338, ty - 9, 8);
  p.rect(52, ty - 24, 286, 12, { bw: 0.8 }); p.v(290, ty - 24, ty - 12, 0.8);
  p.center('Total Hours', 52, 290, ty - 21, 8, bold); p.center(d.continued ? '' : d.totalHours, 290, 338, ty - 21, 8);
  p.text('Comments:', 350, ty - 6, 8, bold);
  p.para(d.notes, 396, ty - 6, 170, 7, font, 8.5, 2);

  // ---- Three Ticket # / Weight tables ----
  const tables: { x: [number, number, number]; top: number; rows: number }[] = [
    { x: [52, 150, 212], top: ty - 36, rows: 6 },
    { x: [258, 352, 414], top: ty - 33, rows: 5 },
    { x: [458, 540, 570], top: ty - 30, rows: 5 },
  ];
  let n = 0;
  for (const t of tables) {
    const g = p.grid(t.x, t.top, 11, 10.5, t.rows, 0.8);
    p.center('Ticket #', t.x[0], t.x[1], t.top - 8.5, 7.5, bold);
    p.center('Weight', t.x[1], t.x[2], t.top - 8.5, 7.5, bold);
    for (let i = 0; i < t.rows; i++, n++) {
      const l = d.loads[n];
      if (!l) continue;
      p.cell(l.ticket || `Load ${l.no}`, t.x[0], t.x[1], g.rowY(i) + 2.5, 7.2);
      p.cell(l.tons, t.x[1], t.x[2], g.rowY(i) + 2.5, 7.2);
    }
  }

  // ---- Their terms ----
  p.rect(52, 20, 518, 82, { bw: 0.8 });
  p.para(TERMS, 57, 93, 508, 6.7, serifItalic, 8.2, 9);
}
