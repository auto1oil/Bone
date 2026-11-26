// The drawing kit the customer ticket forms share: a pen bound to one page
// (text, rules, boxes, labelled fill-in lines, grids) and the ticket's data
// flattened into the plain strings a paper form has blanks for.

import { PDFFont, PDFImage, PDFPage, rgb, type RGB } from 'pdf-lib';

export const INK = rgb(0, 0, 0);
export const DIM = rgb(0.38, 0.38, 0.38);
export const PALE = rgb(0.86, 0.86, 0.86);
export const RED = rgb(0.78, 0.1, 0.1);

// The standard PDF fonts only know WinAnsi. A driver's note with an emoji in
// it would otherwise throw and take the whole ticket down, so anything the
// font can't draw is dropped.
const WINANSI_EXTRA = new Set(['‘', '’', '“', '”', '–', '—', '•', '…', '€', '™']);
export function safe(s: unknown): string {
  if (s === null || s === undefined) return '';
  let out = '';
  for (const ch of String(s).replace(/[\r\n\t]+/g, ' ')) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.has(ch)) out += ch;
  }
  return out;
}

export type Fonts = {
  font: PDFFont; bold: PDFFont; boldItalic: PDFFont;
  serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont;
};

export class Pen {
  constructor(public page: PDFPage, public f: Fonts) {}

  text(s: unknown, x: number, y: number, size = 8, font: PDFFont = this.f.font, color: RGB = INK) {
    const t = safe(s);
    if (t) this.page.drawText(t, { x, y, size, font, color });
  }
  width(s: unknown, size: number, font: PDFFont = this.f.font) { return font.widthOfTextAtSize(safe(s), size); }
  right(s: unknown, xRight: number, y: number, size = 8, font: PDFFont = this.f.font, color: RGB = INK) {
    this.text(s, xRight - this.width(s, size, font), y, size, font, color);
  }
  center(s: unknown, x1: number, x2: number, y: number, size = 8, font: PDFFont = this.f.font, color: RGB = INK) {
    this.text(s, x1 + (x2 - x1 - this.width(s, size, font)) / 2, y, size, font, color);
  }
  // Cut a value down until it fits its blank.
  fit(s: unknown, maxW: number, size: number, font: PDFFont = this.f.font): string {
    let v = safe(s);
    while (v.length > 1 && font.widthOfTextAtSize(v, size) > maxW) v = v.slice(0, -1);
    return v;
  }
  h(x1: number, x2: number, y: number, w = 0.7, color: RGB = INK) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: w, color });
  }
  v(x: number, y1: number, y2: number, w = 0.7, color: RGB = INK) {
    this.page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: w, color });
  }
  rect(x: number, y: number, w: number, hgt: number, opts: { fill?: RGB; border?: RGB; bw?: number } = {}) {
    this.page.drawRectangle({
      x, y, width: w, height: hgt,
      color: opts.fill, borderColor: opts.border ?? (opts.fill ? undefined : INK), borderWidth: opts.fill && !opts.border ? 0 : (opts.bw ?? 0.7),
    });
  }
  // A label, then a rule out to lineEnd with the value written on it.
  field(label: string, x: number, lineEnd: number, y: number, value: unknown, o: {
    size?: number; valueSize?: number; font?: PDFFont; valueFont?: PDFFont; gap?: number; lineW?: number;
  } = {}): number {
    const size = o.size ?? 8;
    const lf = o.font ?? this.f.font;
    this.text(label, x, y, size, lf);
    const lx = x + this.width(label, size, lf) + (o.gap ?? 3);
    this.h(lx, lineEnd, y - 1.5, o.lineW ?? 0.6);
    const vs = o.valueSize ?? size + 0.5;
    const vf = o.valueFont ?? this.f.font;
    this.text(this.fit(value, lineEnd - lx - 4, vs, vf), lx + 2, y + 1, vs, vf);
    return lx;
  }
  // A value written on a rule that has no label of its own.
  onLine(x1: number, x2: number, y: number, value: unknown, size = 8.5, lineW = 0.6) {
    this.h(x1, x2, y - 1.5, lineW);
    this.text(this.fit(value, x2 - x1 - 4, size), x1 + 2, y + 1, size);
  }
  // A tick box, crossed when it's the one.
  check(x: number, y: number, size: number, on: boolean, bw = 0.7) {
    this.rect(x, y, size, size, { bw });
    if (on) {
      this.page.drawLine({ start: { x: x + 1, y: y + 1 }, end: { x: x + size - 1, y: y + size - 1 }, thickness: 1.1, color: INK });
      this.page.drawLine({ start: { x: x + 1, y: y + size - 1 }, end: { x: x + size - 1, y: y + 1 }, thickness: 1.1, color: INK });
    }
  }
  // A ring round a word, as "circle one".
  circle(cx: number, cy: number, rx: number, ry: number, w = 0.9) {
    this.page.drawEllipse({ x: cx, y: cy, xScale: rx, yScale: ry, borderColor: INK, borderWidth: w });
  }
  wrap(s: unknown, width: number, size: number, font: PDFFont = this.f.font, maxLines = 99): string[] {
    const words = safe(s).split(' ').filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) > width && line) {
        lines.push(line); line = w;
        if (lines.length >= maxLines) return lines;
      } else line = cand;
    }
    if (line && lines.length < maxLines) lines.push(line);
    return lines;
  }
  // A paragraph; returns the y under its last line.
  para(s: unknown, x: number, y: number, width: number, size: number, font: PDFFont = this.f.font, leading = size * 1.2, maxLines = 99, color: RGB = INK): number {
    let yy = y;
    for (const line of this.wrap(s, width, size, font, maxLines)) { this.text(line, x, yy, size, font, color); yy -= leading; }
    return yy;
  }
  // A ruled grid: column edges `xs`, a header band, then `rows` rows. Returns
  // the baseline-ish y of the bottom of row i via rowY(i).
  grid(xs: number[], top: number, headH: number, rowH: number, rows: number, w = 0.7) {
    const bottom = top - headH - rows * rowH;
    this.h(xs[0], xs[xs.length - 1], top, w);
    if (headH > 0) this.h(xs[0], xs[xs.length - 1], top - headH, w);
    for (let i = 1; i <= rows; i++) this.h(xs[0], xs[xs.length - 1], top - headH - i * rowH, w);
    for (const x of xs) this.v(x, bottom, top, w);
    return { bottom, rowY: (i: number) => top - headH - (i + 1) * rowH };
  }
  // A value centred or left in one grid cell.
  cell(s: unknown, x1: number, x2: number, y: number, size = 7.5, align: 'left' | 'center' = 'center', font: PDFFont = this.f.font) {
    const v = this.fit(s, x2 - x1 - 4, size, font);
    if (align === 'center') this.center(v, x1, x2, y, size, font); else this.text(v, x1 + 2.5, y, size, font);
  }
  // A signature image sitting on its line.
  sig(img: PDFImage | null, x: number, lineY: number, maxW: number, maxH: number) {
    if (!img) return;
    const s = Math.min(maxW / img.width, maxH / img.height);
    this.page.drawImage(img, { x, y: lineY - 2, width: img.width * s, height: img.height * s });
  }
}

export type FormLoad = {
  no: number;
  loadIn: string; loadOut: string; unloadIn: string; unloadOut: string;
  ticket: string; tons: string; tonsN: number; material: string;
};

// Everything a paper ticket has a blank for, already as text.
export type FormData = {
  label: string;          // HT-1047
  date: string;           // 11/20/2026
  weekday: number | null; // 0 = Sunday
  carrier: string;        // the trucking company the driver is with
  customer: string;
  driver: string;
  truck: string;
  plate: string;
  truckType: string;      // Bone's own type name
  jobName: string;
  jobNumber: string;
  phase: string;
  jobAddress: string;
  pit: string;
  material: string;
  start: string; end: string;
  truckHours: string; travel: string; extra: string; down: string; totalHours: string;
  // Hours on the job itself: the total less travel, for forms that list
  // travel on its own line.
  jobHours: string;
  totalLoads: string; totalTons: string;
  notes: string;
  loads: FormLoad[];
  // The slice of loads being drawn on this page, when a day runs past the
  // rows the form has.
  continued: boolean;
  foremanSig: PDFImage | null; foremanName: string; foremanTime: string;
  driverSig: PDFImage | null;
  signedOut: string;      // 'loaded' | 'empty' | ''
};

export const hrs = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) || Number(n) === 0 ? '' : Number(n).toFixed(2));
