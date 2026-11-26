// The customer ticket forms: turn a ticket and its loads into the plain
// strings a paper form has blanks for, then draw them on that company's
// layout. A day with more loads than the form has rows runs onto a second
// sheet of the same form, marked "continued".

import { PDFDocument, PDFImage, StandardFonts } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAND } from '@/lib/brand';
import { yardClock } from '@/lib/yard-time';
import {
  totalHours, truckHours, ticketLabel, totalLoadTons, countLoads,
  type WorkOrder, type WorkOrderLoad,
} from '@/lib/work-orders';
import type { TicketFormatKey } from '@/lib/ticket-formats';
import { Pen, hrs, type FormData, type FormLoad, type Fonts } from './kit';
import * as custom from './custom-trucking';
import * as arise from './arise';
import * as whitaker from './whitaker';
import * as uhb from './uhb';
import * as osm from './osm';
import * as sunroc from './sunroc';

const BUCKET = 'work-tickets';

type Form = { draw: (p: Pen, d: FormData) => void; ROWS: number; PAGE?: [number, number] };
const FORMS: Record<Exclude<TicketFormatKey, 'bone'>, Form> = {
  custom_trucking: custom, arise, whitaker, uhb, osm, sunroc,
};

// Printed in yard time: the server builds this, and the server is on UTC.
const clock = yardClock;

async function embedPng(db: SupabaseClient, doc: PDFDocument, path: string | null): Promise<PDFImage | null> {
  if (!path) return null;
  try {
    const { data } = await db.storage.from(BUCKET).download(path);
    if (!data) return null;
    return await doc.embedPng(new Uint8Array(await data.arrayBuffer()));
  } catch {
    return null;
  }
}

export async function drawCustomerForm(
  db: SupabaseClient,
  doc: PDFDocument,
  key: Exclude<TicketFormatKey, 'bone'>,
  wo: WorkOrder,
  loads: WorkOrderLoad[],
): Promise<void> {
  const form = FORMS[key];
  const f: Fonts = {
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };

  // Names the forms ask for that the ticket holds as ids.
  let customer = '';
  if (wo.business_id) {
    const { data } = await db.from('businesses').select('name').eq('id', wo.business_id).maybeSingle();
    customer = (data as { name: string } | null)?.name || '';
  }
  if (!customer) customer = wo.customer_number || '';
  let carrier = wo.trucking_company || '';
  if (!carrier && wo.hauler_id) {
    const { data } = await db.from('haulers').select('name').eq('id', wo.hauler_id).maybeSingle();
    carrier = (data as { name: string } | null)?.name || '';
  }
  if (!carrier) carrier = BRAND.legalName;

  const ran = loads
    .filter((l) => l.load_in_at || l.load_out_at || l.unload_in_at || l.unload_out_at || Number(l.tons || 0) > 0)
    .sort((a, b) => a.load_no - b.load_no);
  const rows: FormLoad[] = ran.map((l) => ({
    no: l.load_no,
    loadIn: clock(l.load_in_at), loadOut: clock(l.load_out_at),
    unloadIn: clock(l.unload_in_at), unloadOut: clock(l.unload_out_at),
    ticket: l.ticket_number || '',
    tons: l.tons != null ? Number(l.tons).toFixed(2) : '',
    tonsN: Number(l.tons || 0),
    material: l.material || '',
  }));

  const tons = wo.paper ? Number(wo.tonnage || 0) : totalLoadTons(loads);
  const loadCount = wo.paper ? Number(wo.paper_loads || 0) : countLoads(loads);
  const ymd = wo.job_date && /^\d{4}-\d{2}-\d{2}$/.test(wo.job_date) ? wo.job_date : null;
  const day = ymd ? new Date(`${ymd}T12:00:00`) : null;

  const base: FormData = {
    label: ticketLabel(wo),
    date: ymd ? `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}` : '',
    weekday: day ? day.getDay() : null,
    carrier, customer,
    driver: wo.driver_name || '',
    truck: wo.unit_number || '',
    plate: wo.plate_number || '',
    truckType: wo.truck_type || '',
    jobName: wo.job_name || '',
    jobNumber: wo.job_number || '',
    phase: wo.phase_code || '',
    jobAddress: wo.job_address || '',
    pit: wo.supplier || '',
    material: wo.material || '',
    start: clock(wo.start_at), end: clock(wo.stop_at),
    truckHours: hrs(truckHours(wo)),
    travel: hrs(wo.travel_hours), extra: hrs(wo.extra_hours), down: hrs(wo.down_hours),
    totalHours: hrs(totalHours(wo)),
    jobHours: hrs(Math.max(0, Math.round((totalHours(wo) - Number(wo.travel_hours || 0)) * 100) / 100)),
    totalLoads: loadCount ? String(loadCount) : '',
    totalTons: tons > 0 ? tons.toFixed(2) : '',
    notes: wo.notes || '',
    loads: [],
    continued: false,
    foremanSig: await embedPng(db, doc, wo.foreman_signature_path),
    foremanName: wo.foreman_signature_name || '',
    foremanTime: clock(wo.foreman_signature_signed_at),
    driverSig: await embedPng(db, doc, wo.signature_path),
    signedOut: wo.signed_out_state || '',
  };

  // One sheet per `ROWS` loads; always at least one.
  for (let i = 0; i === 0 || i < rows.length; i += form.ROWS) {
    const page = doc.addPage(form.PAGE ?? [612, 792]);
    form.draw(new Pen(page, f), { ...base, loads: rows.slice(i, i + form.ROWS), continued: i > 0 });
  }
}
