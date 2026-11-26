'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TRUCK_TYPES } from '@/lib/truck-types';
import { pingTicketProgress } from '@/lib/progress-ping';
import MapLink from '@/components/MapLink';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import TicketAttachment from '@/components/TicketAttachment';
import TicketSignature from '@/components/TicketSignature';
import LoadLines, { type LoadTotals } from '@/components/LoadLines';
import CustomerPicker from '@/components/CustomerPicker';
import HaulerOnTicket from '@/components/HaulerOnTicket';
import { BRAND } from '@/lib/brand';
import { orderLabel, ticketDefaultsFrom, type JobOrder } from '@/lib/job-orders';
import {
  onSiteHours, totalHours, ticketAmount, billableUnit, billableQuantity, ticketLabel,
  type WorkOrder,
} from '@/lib/work-orders';
import { runsOn } from '@/lib/ticket-rules';
import { TICKET_FORMATS, ticketFormat, ticketFormatInfo } from '@/lib/ticket-formats';

// Today on the phone's own calendar — not UTC's, which is already tomorrow
// by late afternoon in Utah.
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Which layout office and admin see; crews always get the driver view.
const VIEW_PREF_KEY = 'bone-ticket-view';
const CREW_ROLES = ['driver', 'mechanic', 'labor', 'hauler'];

// The field ticket itself — one form used three ways: a crew member filling one
// out, the same crew member fixing a draft, and the office editing a submitted
// ticket before approving it. `canApprove` puts the office's Approve / Send back
// buttons at the bottom.

type Customer = { id: string; name: string; business_id: string | null; profile_id: string | null };
type Rate = { job_number: string; phase_code: string | null; rate: number; rate_unit: string; description: string | null };

// Local editing state: every field is a string so an emptied input stays empty
// instead of snapping back to 0.
type Draft = Record<string, string>;

const TONNAGE_TYPES = ['', 'Dirt', 'Gravel', 'Asphalt', 'Debris', 'Water', 'Other'];
// The 'TYPE OF TRUCK' column on the paper ticket, in the printed order, with
// the tonnage range the pad prints under each. The exact tons a unit carries
// is optional and goes in the field beside the picker.
// Suggestions only — the field is free text, so a unit that isn't listed
// still gets typed in rather than being blocked.
const EQUIPMENT_TYPES = [
  'Belly Dump', 'End Dump', 'Side Dump', 'Side Dump Double', 'Super Dump',
  'Water Truck', 'Lowboy', 'Excavator', 'Loader', 'Dozer', 'Blade', 'Skid Steer',
];

function toDraft(wo: Partial<WorkOrder> | null): Draft {
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  return {
    order_id: v(wo?.order_id),
    // The form's "customer" is the business the ticket bills.
    customer_id: v(wo?.business_id ?? wo?.customer_id),
    customer_number: v(wo?.customer_number),
    job_number: v(wo?.job_number),
    job_name: v(wo?.job_name),
    job_address: v(wo?.job_address),
    driver_name: v(wo?.driver_name),
    ticket_number: v(wo?.ticket_number),
    trucking_company: v(wo?.trucking_company),
    material: v(wo?.material),
    supplier: v(wo?.supplier),
    truck_type: v(wo?.truck_type),
    truck_type_tons: v(wo?.truck_type_tons),
    plate_number: v(wo?.plate_number),
    driver_start_at: toLocalInput(wo?.driver_start_at ?? null),
    driver_end_at: toLocalInput(wo?.driver_end_at ?? null),
    signed_out_state: v(wo?.signed_out_state),
    sign_out_at: toLocalInput(wo?.sign_out_at ?? null),
    day_number: v(wo?.day_number),
    phase_code: v(wo?.phase_code),
    claim_number: v(wo?.claim_number),
    unit_number: v(wo?.unit_number),
    equipment_type: v(wo?.equipment_type),
    fsr: v(wo?.fsr),
    job_date: v(wo?.job_date) || localToday(),
    start_at: toLocalInput(wo?.start_at ?? null),
    stop_at: toLocalInput(wo?.stop_at ?? null),
    travel_hours: v(wo?.travel_hours),
    down_hours: v(wo?.down_hours),
    extra_hours: v(wo?.extra_hours),
    paper_hours: v(wo?.paper_hours),
    paper_loads: v(wo?.paper_loads),
    report_time: v(wo?.report_time).slice(0, 5),
    rate: v(wo?.rate),
    rate_unit: v(wo?.rate_unit),
    tonnage: v(wo?.tonnage),
    tonnage_type: v(wo?.tonnage_type),
    payment_method: v(wo?.payment_method),
    notes: v(wo?.notes),
  };
}

// The time fields a driver types by hand (start, stop, driver time, sign
// out). A datetime-local box makes them pick a full date and fight a tiny
// text field; this is a date that already says today plus hour/minute/AM-PM
// selects, which phones render as scroll wheels. Starts assume AM, ends
// assume PM — pick an hour and the rest is already right for a normal day.
const WHEEL_HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const WHEEL_MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function TimeWheel({
  label,
  value,
  onChange,
  disabled,
  defaultDate,
  defaultMeridiem,
}: {
  label: string;
  value: string; // 'YYYY-MM-DDTHH:mm' local, or ''
  onChange: (v: string) => void;
  disabled: boolean;
  defaultDate: string;
  defaultMeridiem: 'AM' | 'PM';
}) {
  const [datePart, timePart] = value ? value.split('T') : ['', ''];
  let hour12 = '';
  let minute = '';
  let mer: 'AM' | 'PM' = defaultMeridiem;
  if (timePart) {
    const [hStr, mStr] = timePart.split(':');
    const h = Number(hStr);
    mer = h >= 12 ? 'PM' : 'AM';
    hour12 = String(((h + 11) % 12) + 1);
    minute = mStr || '00';
  }
  const date = datePart || defaultDate;

  function emit(nd: string, nh: string, nm: string, nmer: 'AM' | 'PM') {
    // No hour picked yet means no time at all — a cleared field stays clear.
    if (!nh) { onChange(''); return; }
    let h = Number(nh) % 12;
    if (nmer === 'PM') h += 12;
    onChange(`${nd || defaultDate}T${String(h).padStart(2, '0')}:${nm || '00'}`);
  }

  const sel = 'px-1.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white disabled:bg-gray-100';
  // An exact minute from a stamp or an older ticket stays selectable even if
  // it isn't on the 5-minute wheel.
  const minutes = minute && !WHEEL_MINUTES.includes(minute)
    ? [...WHEEL_MINUTES, minute].sort()
    : WHEEL_MINUTES;

  return (
    <label className="col-span-2">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <div className="flex gap-1.5 items-center flex-wrap">
        <input
          type="date"
          value={date}
          disabled={disabled}
          onChange={(e) => emit(e.target.value, hour12, minute, mer)}
          className={`${sel} flex-1 min-w-[130px]`}
        />
        <select value={hour12} disabled={disabled} className={sel}
          onChange={(e) => emit(date, e.target.value, minute, mer)}>
          <option value="">hr</option>
          {WHEEL_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="text-gray-400">:</span>
        <select value={minute} disabled={disabled} className={sel}
          onChange={(e) => emit(date, hour12 || (defaultMeridiem === 'AM' ? '7' : '5'), e.target.value, mer)}>
          <option value="">min</option>
          {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={mer} disabled={disabled} className={sel}
          onChange={(e) => emit(date, hour12, minute, e.target.value as 'AM' | 'PM')}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
        {value && !disabled && (
          <button type="button" onClick={() => onChange('')} className="text-xs text-gray-400 hover:text-red-600">
            clear
          </button>
        )}
      </div>
    </label>
  );
}

// <input type="datetime-local"> speaks local wall-clock time; the column stores
// an absolute instant. Convert both ways so a saved ticket reopens showing the
// same times the crew typed.
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function WorkOrderForm({
  workOrder,
  canApprove = false,
  onSaved,
}: {
  workOrder: WorkOrder | null;
  canApprove?: boolean;
  onSaved?: (wo: WorkOrder) => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(workOrder));
  const [ticketPhoto, setTicketPhoto] = useState<string | null>(workOrder?.ticket_photo_path ?? null);
  const [shortTicket, setShortTicket] = useState<string | null>(workOrder?.short_ticket_path ?? null);
  const [signature, setSignature] = useState<string | null>(workOrder?.signature_path ?? null);
  const [foremanSignature, setForemanSignature] = useState<string | null>(workOrder?.foreman_signature_path ?? null);
  // Who signed and when — typed name + stamp, saved alongside each drawing.
  const [signatureSigner, setSignatureSigner] = useState<{ name: string | null; at: string | null }>({
    name: workOrder?.signature_name ?? null, at: workOrder?.signature_signed_at ?? null,
  });
  const [foremanSigner, setForemanSigner] = useState<{ name: string | null; at: string | null }>({
    name: workOrder?.foreman_signature_name ?? null, at: workOrder?.foreman_signature_signed_at ?? null,
  });
  // Factor Payment only exists for a company whose Auto 1 Funding account is
  // linked — approved (and revocable) on the factoring app's side.
  const [factorAllowed, setFactorAllowed] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [orders, setOrders] = useState<JobOrder[]>([]);
  // A hauler filling their own ticket is owed the order's pay rate; the
  // customer rate lives on the order, which haulers cannot read at all.
  const [isHauler, setIsHauler] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // Rolled up from the load lines so the live total matches what the server
  // will bill — it recomputes from the same rows before invoicing. The first
  // Load in and last Unload out ride along: on a driver's ticket they ARE
  // the start and stop.
  const [loadTotals, setLoadTotals] = useState<LoadTotals>({ loads: 0, tons: 0, firstIn: null, lastOut: null });
  // Who is holding the phone. A crew member gets the driver view: the job
  // and truck already filled, times off the stamps, BOLs by photo, down and
  // extra time, the foreman's signature — and nothing else to type. Office
  // and admin get the full form, with a switch to see what the driver sees.
  const [me, setMe] = useState<{ id: string; role: string; full_name: string | null; hauler_id: string | null } | null>(null);
  // Paper copy: the driver ran a paper ticket and photographs it instead of
  // tapping times.
  const [paper, setPaper] = useState<boolean>(!!workOrder?.paper);
  // Which company's ticket this prints on. The job can name it; the driver
  // or the office can change it.
  const [ticketForm, setTicketForm] = useState<string>(ticketFormat(workOrder?.ticket_format));
  const [viewPref, setViewPref] = useState<'driver' | 'full'>('full');
  const isCrew =!!me && (CREW_ROLES.includes(me.role) || !!me.hauler_id);
  const driverView = !!me && (isCrew ? true : viewPref === 'driver');
  // The factoring app's bill of sale for a Factor Payment ticket. The hauler
  // signs it over there; completing the ticket requires the signature.
  const [bos, setBos] = useState<{ url: string; accepted: boolean; accepted_by: string | null; accepted_at: string | null } | null>(null);
  const [bosBusy, setBosBusy] = useState(false);
  const [bosError, setBosError] = useState('');

  const id = workOrder?.id ?? null;
  const status = workOrder?.status ?? 'draft';
  // A draft or a sent-back ticket is the crew's to edit; once the office has
  // it, only the office can change it.
  const editable = status === 'draft' || status === 'rejected' || status === 'submitted';
  // An invoiced ticket is closed to everyone — the money is booked in
  // QuickBooks, so a change here would silently disagree with the invoice.
  const locked = status === 'invoiced' || (!editable && !canApprove);
  // A hauler's ticket off a dispatched job keeps the job's facts read-only:
  // the job, address, phase, and their pay rate came with the load. The
  // server strips these from a hauler's save too — this is the visible half.
  const orderLocked = locked || (isHauler && !!draft.order_id);
  // A dispatched ticket's job section is already filled and locked; fold it
  // to one line so the driver lands on stamps, times and signatures.
  const [showJob, setShowJob] = useState(false);
  const jobFolded = isHauler && !!draft.order_id && !showJob;

  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  // Picking an order pulls its agreed terms onto the ticket. Only blank
  // fields are filled — a crew that already typed a rate keeps it, and the
  // difference is what gets flagged for the office rather than overwritten.
  function applyOrder(orderId: string, orderList: JobOrder[] = orders, haulerSide: boolean = isHauler) {
    const picked = orderList.find((o) => o.id === orderId);
    if (!picked) { set('order_id', orderId); return; }
    const defaults = ticketDefaultsFrom(picked, haulerSide);
    // The order's tonnage type is the nearest thing it has to a material.
    if (picked.tonnage_type) defaults.material = picked.tonnage_type;
    setDraft((d) => {
      const next = { ...d, order_id: orderId };
      for (const [k, val] of Object.entries(defaults)) {
        if (!next[k]) next[k] = val;
      }
      return next;
    });
  }

  useEffect(() => {
    (async () => {
      const [{ data: bizRows }, { data: rateRows }, { data: orderRows }] = await Promise.all([
        supabase.from('businesses').select('id, name').order('name'),
        supabase.from('job_rates').select('job_number, phase_code, rate, rate_unit, description').eq('active', true),
        // Finished and cancelled orders aren't offered — a ticket filed
        // against one is almost always the wrong order picked in a hurry.
        supabase.from('job_orders').select('*').in('status', ['open', 'active'])
          .order('order_number', { ascending: false }),
      ]);
      setCustomers(((bizRows as { id: string; name: string }[]) || [])
        .map((b) => ({ id: b.id, name: b.name, business_id: b.id, profile_id: null })));
      setRates((rateRows as Rate[]) || []);
      const openOrders = (orderRows as JobOrder[]) || [];
      setOrders(openOrders);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Anyone on a hauling company's side — the company login OR one of
        // its drivers — gets the hauler treatment: no order book, job fields
        // locked, pay-side rate only.
        const { data: prof } = await supabase.from('profiles').select('id, role, full_name, hauler_id').eq('id', user.id).single();
        const haulerSide = prof?.role === 'hauler' || !!prof?.hauler_id;
        setIsHauler(haulerSide);
        if (prof) setMe({ id: prof.id, role: prof.role, full_name: prof.full_name, hauler_id: prof.hauler_id });
        try {
          const pref = localStorage.getItem(VIEW_PREF_KEY);
          if (pref === 'driver' || pref === 'full') setViewPref(pref);
        } catch { /* default stands */ }
        if (haulerSide) {
          try {
            const res = await fetch('/api/haulers/factoring-link', { cache: 'no-store' });
            const json = await res.json();
            setFactorAllowed(json.ok && json.status === 'linked');
          } catch { /* stays hidden — no answer is not a yes */ }
        }

        // A brand-new ticket starts with everything the app already knows:
        // the driver's name, the truck they usually drive (their fleet
        // assignment, else their last ticket), and the job — the order their
        // last ticket was on if it's still open, or the only open order.
        if (!workOrder && prof) {
          const [{ data: lastRows }, { data: truckRows }] = await Promise.all([
            supabase.from('work_orders')
              .select('order_id, unit_number, plate_number, truck_type, truck_type_tons, trucking_company, equipment_type')
              .eq('submitted_by', prof.id).order('created_at', { ascending: false }).limit(1),
            prof.hauler_id
              ? Promise.resolve({ data: null })
              : supabase.from('fleet_vehicles').select('unit_number, plate').eq('assigned_driver_id', prof.id).eq('active', true).limit(1),
          ]);
          const last = (lastRows as Partial<WorkOrder>[] | null)?.[0];
          const truck = (truckRows as { unit_number: string; plate: string | null }[] | null)?.[0];
          setDraft((d) => {
            const next = { ...d };
            const fill = (k: string, v: unknown) => { if (!next[k] && v != null && v !== '') next[k] = String(v); };
            fill('driver_name', prof.full_name);
            fill('unit_number', truck?.unit_number);
            fill('plate_number', truck?.plate);
            if (last) {
              for (const k of ['unit_number', 'plate_number', 'truck_type', 'truck_type_tons', 'trucking_company', 'equipment_type'] as const) fill(k, last[k]);
            }
            return next;
          });
          const today = localToday();
          const running = openOrders.filter((o) => runsOn(o, today));
          const lastOrder = last?.order_id ? running.find((o) => o.id === last.order_id) : undefined;
          const pickOrder = lastOrder ? lastOrder.id : running.length === 1 ? running[0].id : '';
          if (pickOrder && !haulerSide) applyOrder(pickOrder, openOrders, haulerSide);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // On a driver's ticket the clock is the stamps: start is the first Load
  // in, stop is the last Unload out. Nothing to type, nothing to misremember
  // at the end of the day; clearing a stamp moves the time with it. (The
  // server does the same on submit, so a posted time can't disagree.)
  useEffect(() => {
    if (!driverView || locked || !id || paper) return;
    const start = toLocalInput(loadTotals.firstIn);
    const stop = toLocalInput(loadTotals.lastOut);
    setDraft((d) => (d.start_at === start && d.stop_at === stop && d.driver_start_at === start && d.driver_end_at === stop
      ? d
      : { ...d, start_at: start, stop_at: stop, driver_start_at: start, driver_end_at: stop }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverView, locked, id, paper, loadTotals.firstIn, loadTotals.lastOut]);

  // The job list refreshes whenever the driver comes back to the app: a job
  // the office created after the day started shows up without a reload.
  const loadOrders = useCallback(async () => {
    const { data } = await supabase.from('job_orders').select('*').in('status', ['open', 'active'])
      .order('order_number', { ascending: false });
    if (data) setOrders(data as JobOrder[]);
  }, [supabase]);
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') loadOrders(); };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); };
  }, [loadOrders]);

  function setView(v: 'driver' | 'full') {
    setViewPref(v);
    try { localStorage.setItem(VIEW_PREF_KEY, v); } catch { /* fine */ }
  }

  // The agreed rate for the job/phase typed above, so the crew doesn't have to
  // remember it. Exact phase match wins; a job-wide rate is the fallback.
  const suggestedRate = useMemo(() => {
    const job = draft.job_number.trim();
    if (!job) return null;
    const forJob = rates.filter((r) => r.job_number === job);
    if (forJob.length === 0) return null;
    const phase = draft.phase_code.trim();
    return forJob.find((r) => (r.phase_code || '') === phase) || forJob.find((r) => !r.phase_code) || forJob[0];
  }, [rates, draft.job_number, draft.phase_code]);

  const preview = {
    start_at: fromLocalInput(draft.start_at),
    stop_at: fromLocalInput(draft.stop_at),
    travel_hours: Number(draft.travel_hours) || 0,
    down_hours: Number(draft.down_hours) || 0,
    extra_hours: Number(draft.extra_hours) || 0,
    paper,
    paper_hours: Number(draft.paper_hours) || 0,
    paper_loads: Number(draft.paper_loads) || 0,
    // The job's minimum: off the picked order, else what the ticket carries.
    min_hours: Number(orders.find((o) => o.id === draft.order_id)?.min_hours ?? workOrder?.min_hours ?? 0) || 0,
    rate: Number(draft.rate) || 0,
    rate_unit: draft.rate_unit || null,
    tonnage: Number(draft.tonnage) || 0,
    tonnage_type: draft.tonnage_type || null,
    loads_count: loadTotals.loads,
  };
  const hours = totalHours(preview);
  // Bill off the load lines when they carry weights, exactly as the server
  // does at invoice time, so the figure on screen is the figure billed.
  const previewLoads = [{ tons: loadTotals.tons }];
  const amount = ticketAmount(preview, previewLoads);
  const unit = billableUnit(preview, previewLoads);

  function body(): Record<string, unknown> {
    return {
      // Sent only when it isn't the Bone ticket it started as.
      ...(ticketForm !== 'bone' || ticketFormat(workOrder?.ticket_format) !== 'bone'
        ? { ticket_format: ticketForm === 'bone' ? null : ticketForm } : {}),
      order_id: draft.order_id || null,
      business_id: draft.customer_id || null,
      customer_number: draft.customer_number.trim() || null,
      job_number: draft.job_number.trim() || null,
      job_name: draft.job_name.trim() || null,
      job_address: draft.job_address.trim() || null,
      driver_name: draft.driver_name.trim() || null,
      ticket_number: draft.ticket_number.trim() || null,
      trucking_company: draft.trucking_company.trim() || null,
      material: draft.material.trim() || null,
      supplier: draft.supplier.trim() || null,
      truck_type: draft.truck_type || null,
      truck_type_tons: draft.truck_type_tons === '' ? null : Number(draft.truck_type_tons),
      plate_number: draft.plate_number.trim() || null,
      driver_start_at: fromLocalInput(draft.driver_start_at),
      driver_end_at: fromLocalInput(draft.driver_end_at),
      signed_out_state: draft.signed_out_state || null,
      sign_out_at: fromLocalInput(draft.sign_out_at),
      day_number: draft.day_number.trim() || null,
      phase_code: draft.phase_code.trim() || null,
      claim_number: draft.claim_number.trim() || null,
      unit_number: draft.unit_number.trim() || null,
      equipment_type: draft.equipment_type.trim() || null,
      fsr: draft.fsr.trim() || null,
      job_date: draft.job_date || null,
      start_at: fromLocalInput(draft.start_at),
      stop_at: fromLocalInput(draft.stop_at),
      travel_hours: draft.travel_hours === '' ? null : Number(draft.travel_hours),
      down_hours: draft.down_hours === '' ? null : Number(draft.down_hours),
      extra_hours: draft.extra_hours === '' ? null : Number(draft.extra_hours),
      report_time: draft.report_time || null,
      paper,
      paper_hours: draft.paper_hours === '' ? null : Number(draft.paper_hours),
      paper_loads: draft.paper_loads === '' ? null : Number(draft.paper_loads),
      rate: draft.rate === '' ? null : Number(draft.rate),
      rate_unit: draft.rate_unit || null,
      tonnage: draft.tonnage === '' ? null : Number(draft.tonnage),
      tonnage_type: draft.tonnage_type || null,
      ticket_photo_path: ticketPhoto,
      short_ticket_path: shortTicket,
      signature_path: signature,
      foreman_signature_path: foremanSignature,
      signature_name: signatureSigner.name,
      signature_signed_at: signatureSigner.at,
      foreman_signature_name: foremanSigner.name,
      foreman_signature_signed_at: foremanSigner.at,
      // A hauler completing without picking is standard pay — the default,
      // not a gap the office has to chase. Factor only stands while the
      // company's Auto 1 Funding link does; the server re-checks live.
      payment_method: draft.payment_method === 'factor' && isHauler && !factorAllowed
        ? 'standard'
        : (draft.payment_method || (isHauler ? 'standard' : null)),
      notes: draft.notes.trim() || null,
    };
  }

  // Fetch (and optionally open) the bill of sale. Idempotent server-side, so
  // calling again is how we poll for the signature. Tab opens before the
  // await — Safari blocks a window.open that comes after one.
  async function loadBos(open: boolean) {
    if (!id) return;
    setBosBusy(true); setBosError('');
    const tab = open ? window.open('about:blank', '_blank') : null;
    try {
      const res = await fetch(`/api/work-orders/${id}/bill-of-sale`, { method: 'POST' });
      const json = await res.json();
      if (!json.ok || !json.url) {
        tab?.close();
        setBosError(json.error || 'Could not get the bill of sale.');
        return;
      }
      setBos({
        url: json.url,
        accepted: !!json.accepted,
        accepted_by: json.accepted_by ?? null,
        accepted_at: json.accepted_at ?? null,
      });
      if (tab) tab.location.href = json.url;
    } catch {
      tab?.close();
      setBosError('Network error — try again.');
    } finally {
      setBosBusy(false);
    }
  }

  // Picking Factor Payment fetches the document; coming back to this tab
  // after signing in the other one re-checks it, so the green tick appears
  // without a manual refresh.
  useEffect(() => {
    if (!isHauler || draft.payment_method !== 'factor' || !id) return;
    if (!bos) loadBos(false);
    const onFocus = () => loadBos(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHauler, draft.payment_method, id]);

  // Share the printable haul ticket — the phone's share sheet handles text,
  // email, AirDrop, whatever's on the device. The current fields are saved
  // first so the PDF matches the screen, then the fresh PDF is fetched and
  // handed to the share sheet as a file. Where file-sharing isn't available
  // (desktop), the PDF opens in a tab instead.
  async function shareTicket() {
    if (!id) return;
    setBusy('share'); setError(''); setMsg('');
    try {
      if (!locked) {
        await fetch(`/api/work-orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body()),
        }).catch(() => null);
      }
      const res = await fetch(`/api/work-orders/${id}/ticket-pdf`, { method: 'POST' });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not build the ticket PDF.'); return; }

      let shared = false;
      try {
        const blob = await fetch(json.url).then((r) => r.blob());
        const file = new File([blob], json.filename, { type: 'application/pdf' });
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Haul ticket',
            text: [draft.job_number ? `Job ${draft.job_number}` : null, draft.job_date].filter(Boolean).join(' · '),
          });
          shared = true;
        }
      } catch (e) {
        // Backing out of the share sheet is not an error worth showing.
        if (e instanceof Error && e.name === 'AbortError') { setBusy(''); return; }
      }
      if (!shared) {
        const tab = window.open('about:blank', '_blank');
        if (tab) tab.location.href = json.url; else window.location.href = json.url;
      }
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy('');
    }
  }

  // ---- Things that save the moment they happen --------------------------
  // The job pick, a paper photo: neither should wait
  // on the driver remembering to tap Save.
  async function quickSave(partial: Record<string, unknown>) {
    if (!id || locked) return;
    try {
      const res = await fetch(`/api/work-orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(partial),
      });
      const json = await res.json();
      if (json.ok) onSaved?.(json.work_order as WorkOrder);
      else setError(json.error || 'Could not save that.');
    } catch { /* it rides along on the next save */ }
  }

  // Which company's ticket this is written on. Saves at once.
  function pickForm(key: string) {
    const k = ticketFormat(key);
    setTicketForm(k);
    quickSave({ ticket_format: k === 'bone' ? null : k });
  }

  // Pick or change the job. It saves at once; the server checks the job is
  // open and running that day, and writes the job's facts onto the ticket.
  // Nothing already tapped is lost — times, loads and photos live on the
  // ticket, not the job.
  async function pickJob(orderId: string) {
    const picked = orders.find((o) => o.id === orderId) || null;
    const before = draft;
    const v = (x: unknown) => (x === null || x === undefined ? '' : String(x));
    setDraft({
      ...draft,
      order_id: orderId,
      customer_id: v(picked?.business_id), customer_number: v(picked?.customer_number),
      job_number: v(picked?.job_number), job_name: v(picked?.job_name), job_address: v(picked?.job_address),
      supplier: v(picked?.pickup_address), phase_code: v(picked?.phase_code), fsr: v(picked?.fsr),
      rate: v(picked?.rate), rate_unit: v(picked?.rate_unit), travel_hours: v(picked?.travel_hours),
      material: draft.material || v(picked?.tonnage_type),
    });
    setError(''); setMsg('');
    if (!id) return;
    setBusy('job');
    try {
      const res = await fetch(`/api/work-orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body(), order_id: orderId || null, ticket_format: undefined }),
      });
      const json = await res.json();
      if (!json.ok) { setDraft(before); setError(json.error || 'Could not put the ticket on that job.'); return; }
      setTicketForm(ticketFormat((json.work_order as WorkOrder).ticket_format));
      onSaved?.(json.work_order as WorkOrder);
      setMsg(orderId ? 'Job saved on the ticket.' : 'Job taken off the ticket.');
    } catch {
      setDraft(before);
      setError('Network error — the job didn\u2019t save. Try again when you have signal.');
    } finally {
      setBusy('');
    }
  }

  function switchPaper(on: boolean) {
    setPaper(on);
    quickSave({ paper: on });
  }

  async function save(submit: boolean, extra: Record<string, unknown> = {}) {
    const isPaper = extra.paper === true || paper;
    if (submit && driverView) {
      // Finish day: a job, and either the stamps or the paper's photo. The
      // server checks the rest (a BOL photo on every load) against the loads.
      const hasJob = isHauler ? !!(draft.order_id || draft.job_number.trim()) : !!draft.order_id;
      if (!hasJob) { setError('Pick the job this ticket is for first — it\u2019s at the top of the ticket.'); return; }
      if (isPaper) {
        if (!ticketPhoto && !shortTicket) { setError('Add a photo of the paper ticket before finishing.'); return; }
      } else if (!draft.start_at || !draft.stop_at) {
        setError('The day needs at least one load with a Load in and an Unload out stamped — those set the start and end.');
        return;
      }
    } else if (submit) {
      if (!draft.job_number.trim()) { setError('Enter the job number before completing the ticket.'); return; }
      if (!isPaper && (!draft.start_at || !draft.stop_at)) { setError('Enter the start and stop times before completing the ticket.'); return; }
      if (!ticketPhoto) { setError('Attach a photo of the paper ticket before completing it.'); return; }
      if (!foremanSignature) { setError('The job foreman needs to sign the ticket before it goes in.'); return; }
      if (!foremanSigner.name) { setError('The foreman\u2019s typed name is missing — clear their signature and have them sign again with their name.'); return; }
    }
    setBusy(submit ? 'submit' : 'save'); setError(''); setMsg('');
    try {
      const res = await fetch(id ? `/api/work-orders/${id}` : '/api/work-orders', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body(), ...extra, submit }),
      });
      const json = await res.json();
      if (!json.ok) {
        // Completing a Factor Payment ticket without the signed bill of sale
        // saves everything and hands back the signing link — surface it.
        if (json.bill_of_sale_url) {
          setBos({ url: json.bill_of_sale_url, accepted: false, accepted_by: null, accepted_at: null });
        }
        setError(json.error || 'Could not save the ticket.');
        return;
      }
      setMsg(submit ? 'Completed — it\u2019s with the office now.'
        : json.existing ? 'You already have today\u2019s ticket open — here it is.'
        : driverView && !id ? (isPaper ? 'Paper ticket started — add the photo.' : 'Day started — stamp Load in at the pit.')
        : 'Saved.');
      pingTicketProgress(json.work_order?.id);
      onSaved?.(json.work_order as WorkOrder);
      if (!id) router.replace(`/tickets/${json.work_order.id}`);
      else router.refresh();
    } catch {
      setError('Network error — check your signal and try again.');
    } finally {
      setBusy('');
    }
  }

  // only = approve the ticket and leave the invoice for later (the billing
  // isn't set up yet, or the office bills this customer some other way).
  async function approve(reject: boolean, only = false) {
    if (!id) return;
    const reason = reject ? window.prompt('What needs fixing?')?.trim() : '';
    if (reject && !reason) return;
    setBusy(reject ? 'reject' : only ? 'approveonly' : 'approve'); setError(''); setMsg('');
    try {
      // Save any edits first so the office approves what's on screen.
      await fetch(`/api/work-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      });
      const res = await fetch(`/api/work-orders/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(only ? { as: 'office', invoice: false } : { as: 'office', reject, reason }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not record the approval.'); return; }
      if (json.invoice_error) setMsg(`Approved, but the invoice didn\u2019t go: ${json.invoice_error}. Send it from the ticket list.`);
      else if (json.invoice?.local) setMsg(json.invoice.emailed
        ? `Invoice ${json.invoice.invoice_number} emailed to ${json.invoice.emailed_to}.`
        : `Invoice ${json.invoice.invoice_number} created, not emailed. ${json.invoice.email_error || ''} Send it from the Invoices tab.`);
      else if (json.invoice) setMsg(`Approved and invoiced — QuickBooks #${json.invoice.invoice_number}.`);
      else setMsg(reject ? 'Sent back to the crew.' : only ? 'Approved. No invoice was made; send it from the ticket list when billing is ready.' : 'Approved.');
      onSaved?.(json.work_order as WorkOrder);
      router.refresh();
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy('');
    }
  }

  const input = 'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm';
  // Order-owned fields on a hauler's ticket: shaded so it reads as "came
  // with the job", not as a broken input.
  const lockedField = `${input} bg-gray-100 text-gray-500 cursor-not-allowed`;
  const jobInput = orderLocked ? lockedField : input;
  const label = 'block text-xs font-medium text-gray-600 mb-1';

  // The signature stops counting once the office sends the ticket back —
  // the refreshed bill of sale has to be agreed to again.
  const bosStale = !!(
    bos?.accepted
    && workOrder?.bos_reset_at
    && (!bos.accepted_at || new Date(bos.accepted_at) <= new Date(workOrder.bos_reset_at))
  );

  // Office and admin can look at a ticket the way its driver does.
  const viewToggle = me && !isCrew ? (
    <div className="flex justify-end">
      <button type="button" onClick={() => setView(driverView ? 'full' : 'driver')} className="text-xs text-brand-700 hover:underline">
        {driverView ? 'Show the full form' : 'Show the driver view'}
      </button>
    </div>
  ) : null;

  const paymentBlock = (
    <>
      {/* How the hauler wants paying. Factor hands the approved ticket to the
          factoring service to fund; standard waits on Bone's pay run. */}
      {isHauler && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-1">
            How do you want this ticket paid?
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Factor Payment sends the approved ticket straight to the factoring
            service to fund. Standard Pay stays on the normal pay run.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {/* Factor Payment only exists once the company's Auto 1 Funding
                account is linked — no account, no button. */}
            {(factorAllowed
              ? ([['standard', 'Standard Pay'], ['factor', 'Factor Payment']] as const)
              : ([['standard', 'Standard Pay']] as const)
            ).map(([value, title]) => (
              <button
                key={value}
                type="button"
                disabled={locked}
                onClick={() => set('payment_method', value)}
                className={`px-3 py-2.5 rounded-md border text-sm font-medium disabled:opacity-50 ${
                  (draft.payment_method || 'standard') === value
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {title}
              </button>
            ))}
          </div>
          {!factorAllowed && (
            <p className="mt-2 text-[11px] text-gray-500">
              Factor Payment shows up here once your Auto 1 Funding account is
              linked and approved — request it under{' '}
              <Link href="/hauler/company" className="text-brand-700 hover:underline">Company</Link>.
            </p>
          )}

          {/* Factor Payment comes with a bill of sale to sign at the
              factoring app. Completing the ticket requires the signature. */}
          {draft.payment_method === 'factor' && (
            !id ? (
              <p className="mt-3 text-xs text-gray-500">
                Save the draft once and the bill of sale to sign appears here.
              </p>
            ) : bos?.accepted && !bosStale ? (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Bill of sale signed
                {bos.accepted_by ? ` by ${bos.accepted_by}` : ''}
                {bos.accepted_at ? ` · ${new Date(bos.accepted_at).toLocaleString()}` : ''}.
              </p>
            ) : (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm text-amber-900">
                  {bosStale
                    ? 'The office sent this ticket back, so the amounts changed. The refreshed bill of sale needs to be signed again before completing.'
                    : 'The factoring company’s bill of sale needs your signature before this ticket can be completed. It reflects the last saved numbers — save the draft again if you just changed times or loads.'}
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => loadBos(true)}
                    disabled={bosBusy}
                    className="px-3 py-1.5 text-xs rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900 disabled:opacity-50"
                  >
                    {bosBusy ? 'Working…' : 'Open & sign the bill of sale'}
                  </button>
                  <button
                    type="button"
                    onClick={() => loadBos(false)}
                    disabled={bosBusy}
                    className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-white disabled:opacity-50"
                  >
                    I signed it — check again
                  </button>
                </div>
                {bosError && <p className="text-xs text-red-600 mt-1.5">{bosError}</p>}
              </div>
            )
          )}
        </div>
      )}

    </>
  );

  const actionButtons = (
      <div className="flex flex-wrap gap-2 pb-8">
        {!locked && (
          <>
            <button
              onClick={() => save(false)}
              disabled={!!busy}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === 'save' ? 'Saving…' : driverView ? 'Save' : 'Save draft'}
            </button>
            {(status === 'draft' || status === 'rejected') && (
              <button
                onClick={() => save(true)}
                disabled={!!busy}
                className="px-4 py-2 text-sm bg-brand-700 text-white rounded-md hover:bg-brand-900 disabled:opacity-50 font-medium"
              >
                {busy === 'submit' ? 'Completing…' : status === 'rejected' ? 'Fix and send back' : driverView ? 'Finish day — send to the office' : 'Complete ticket'}
              </button>
            )}
          </>
        )}
        {canApprove && status === 'submitted' && (
          <>
            <button
              onClick={() => approve(false)}
              disabled={!!busy}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 font-medium"
            >
              {busy === 'approve' ? 'Sending…' : 'Send Invoice'}
            </button>
            <button
              onClick={() => approve(false, true)}
              disabled={!!busy}
              title="Approve the ticket now and invoice it later"
              className="px-4 py-2 text-sm border border-emerald-600 text-emerald-700 rounded-md hover:bg-emerald-50 disabled:opacity-50 font-medium"
            >
              {busy === 'approveonly' ? 'Approving…' : 'Approve only'}
            </button>
            <button
              onClick={() => approve(true)}
              disabled={!!busy}
              className="px-4 py-2 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              {busy === 'reject' ? 'Sending back…' : 'Send back'}
            </button>
          </>
        )}
      </div>
  );

  // ---- The driver view ---------------------------------------------------
  // One driver's day on one job, on one ticket. Start now, pick the job
  // later: the times, loads and photos live on the ticket, so nothing waits
  // on the office. The head fills itself from the job once it's picked;
  // start and end come off the first Load in and the last Unload out. What
  // the driver touches is the stamps, a BOL photo per load, down and extra
  // time — or, on a paper day, photos of the paper ticket and its totals.
  const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
  const weekday = draft.job_date ? new Date(`${draft.job_date}T12:00:00`).toLocaleDateString([], { weekday: 'short' }).toUpperCase() : '';
  const customerName = customers.find((c) => c.id === draft.customer_id)?.name || '';
  const reportLabel = draft.report_time
    ? new Date(`2000-01-01T${draft.report_time}:00`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  const headRow = (k: string, v: React.ReactNode) => (v ? (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-0.5"><span className="text-gray-500">{k}</span><span className="text-gray-900">{v}</span></div>
  ) : null);
  // Jobs running on the ticket's day, plus whichever one is already on it.
  const jobChoices = orders.filter((o) => o.id === draft.order_id || runsOn(o, draft.job_date));
  // The job is the driver's to pick until the ticket is in; then the office moves it.
  const jobLocked = locked || (isCrew && !(status === 'draft' || status === 'rejected'));

  if (driverView) return (
    <div className="space-y-4">
      {workOrder?.hauler_id && <HaulerOnTicket haulerId={workOrder.hauler_id} />}
      {viewToggle}

      <div className="bg-white border-2 border-brand-700 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            {ticketForm === 'bone' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/bone-logo.png" alt={BRAND.name} className="h-8 w-auto mb-1" />
            ) : (
              <div className="text-xl font-black tracking-tight leading-tight">{ticketFormatInfo(ticketForm).label}</div>
            )}
            <div className="text-[11px] text-gray-500">{BRAND.legalName} · {BRAND.addressLines.join(', ')} · {BRAND.phone}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Haul ticket{paper ? ' · paper copy' : ''}</div>
            <div className="text-xl font-bold text-accent-400 tabular-nums">{workOrder ? ticketLabel(workOrder) : 'New'}</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-brand-700 text-brand-700">{weekday}</span>
            {reportLabel && <span className="text-sm font-semibold text-accent-400">Start {reportLabel}</span>}
          </span>
          <input type="date" value={draft.job_date} onChange={(e) => set('job_date', e.target.value)} disabled={locked} className={`${input} w-auto font-semibold`} />
        </div>

        <div className="mt-3 text-sm">
          {isHauler ? (
            <p className="text-xs text-gray-600 mb-2">
              {draft.order_id
                ? 'This ticket is against the job Bone sent you. The job came with it; your loads, times and photos are what you fill in.'
                : 'Start from the load Bone sent you and the job fills itself in, or fill the job in below.'}
            </p>
          ) : (
            <label className="block mb-2">
              <span className={label}>Job (order)</span>
              <select value={draft.order_id} onChange={(e) => pickJob(e.target.value)} disabled={jobLocked || busy === 'job'}
                className={`${input} font-medium ${draft.order_id ? '' : 'border-amber-400 bg-amber-50 text-amber-900'}`}>
                <option value="">{jobChoices.length ? 'Pick the job you’re hauling on…' : 'No jobs open today — ask the office'}</option>
                {jobChoices.map((o) => <option key={o.id} value={o.id}>{orderLabel(o)}</option>)}
              </select>
              {!draft.order_id && !jobLocked && (
                <span className="block mt-1 text-[11px] text-amber-800">
                  {jobChoices.length
                    ? 'You can start and stamp loads now and pick the job later. It has to be picked before you finish.'
                    : 'Keep working: stamp your loads and take your BOL photos. When the office adds the job it shows up here.'}
                </span>
              )}
              {jobLocked && !locked && isCrew && (
                <span className="block mt-1 text-[11px] text-gray-500">Wrong job? The office moves it.</span>
              )}
            </label>
          )}
          <label className="block mb-2">
            <span className={label}>Ticket form</span>
            <select value={ticketForm} onChange={(e) => pickForm(e.target.value)} disabled={locked} className={input}>
              {TICKET_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <span className="block mt-1 text-[11px] text-gray-500">
              {ticketForm === 'bone'
                ? 'The Bone ticket. If the customer wants this on their own form, pick it here.'
                : `This ticket prints on the ${ticketFormatInfo(ticketForm).title} form.`}
            </span>
          </label>
          {headRow('Customer', customerName || draft.customer_number)}
          {headRow('Job', draft.job_name)}
          {headRow('Job #', [draft.job_number, draft.phase_code ? `Phase ${draft.phase_code}` : null].filter(Boolean).join(' · '))}
          {headRow('Pit', draft.supplier ? <><span>{draft.supplier}</span> <MapLink address={draft.supplier} /></> : null)}
          {headRow('Job address', draft.job_address ? <><span>{draft.job_address}</span> <MapLink address={draft.job_address} /></> : null)}
          <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-0.5 items-center">
            <span className="text-gray-500">Material</span>
            <input value={draft.material} onChange={(e) => set('material', e.target.value)} disabled={locked} placeholder="What's being hauled" className={input} />
          </div>
          {isHauler && !draft.order_id && !locked && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <label><span className={label}>Job #</span><input value={draft.job_number} onChange={(e) => set('job_number', e.target.value)} className={input} /></label>
              <label><span className={label}>Job name</span><input value={draft.job_name} onChange={(e) => set('job_name', e.target.value)} className={input} /></label>
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-gray-500">Driver</span>
            {draft.driver_name && !locked ? (
              <span className="font-semibold">{draft.driver_name}</span>
            ) : (
              <input value={draft.driver_name} onChange={(e) => set('driver_name', e.target.value)} disabled={locked} placeholder="Your name" className={`${input} max-w-xs`} />
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label><span className={label}>Truck #</span>
              <input value={draft.unit_number} onChange={(e) => set('unit_number', e.target.value)} disabled={locked} className={input} />
            </label>
            <label><span className={label}>Plate #</span>
              <input value={draft.plate_number} onChange={(e) => set('plate_number', e.target.value)} disabled={locked} className={input} />
            </label>
            <label><span className={label}>Type of truck</span>
              <select value={draft.truck_type} onChange={(e) => set('truck_type', e.target.value)} disabled={locked} className={input}>
                <option value="">—</option>
                {TRUCK_TYPES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                <option value="Other">Other</option>
              </select>
            </label>
          </div>
        </div>

        {!paper && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className={`rounded-lg border px-3 py-2 ${preview.start_at ? 'border-emerald-200 bg-emerald-50' : 'border-dashed border-gray-300'}`}>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Start</div>
              <div className="text-lg font-bold tabular-nums">{preview.start_at ? clock(preview.start_at) : <span className="text-sm font-normal text-gray-500">first Load in</span>}</div>
              <div className="text-[10px] text-gray-500">set by the first Load in</div>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${preview.stop_at ? 'border-emerald-200 bg-emerald-50' : 'border-dashed border-gray-300'}`}>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">End</div>
              <div className="text-lg font-bold tabular-nums">{preview.stop_at ? clock(preview.stop_at) : <span className="text-sm font-normal text-gray-500">last Unload out</span>}</div>
              <div className="text-[10px] text-gray-500">set by the last Unload out</div>
            </div>
          </div>
        )}
      </div>

      {!id ? (
        <div className="bg-white border-2 border-dashed border-brand-700 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-700 mb-3">
            {draft.order_id || draft.job_number
              ? 'Job’s picked, truck’s on. Start the day and the load lines open up: one tap at the pit, one at the site.'
              : 'No job yet? Start anyway. Stamp your loads and pick the job when the office has it up.'}
          </p>
          <button onClick={() => save(false)} disabled={!!busy}
            className="px-6 py-3 text-base bg-brand-700 text-white rounded-lg hover:bg-brand-900 disabled:opacity-50 font-semibold">
            {busy === 'save' ? 'Starting…' : 'Start the day'}
          </button>
          <div className="mt-3">
            <button type="button" onClick={() => save(false, { paper: true })} disabled={!!busy}
              className="text-sm text-brand-700 underline decoration-dotted underline-offset-2 disabled:opacity-50">
              Running a paper ticket today? Upload a photo of it instead
            </button>
          </div>
        </div>
      ) : paper ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Paper ticket</h2>
            {!locked && (
              <button type="button" onClick={() => switchPaper(false)} className="text-xs text-brand-700 underline decoration-dotted underline-offset-2">
                Use the digital ticket instead
              </button>
            )}
          </div>
          <p className="text-xs text-gray-600">Photograph the paper ticket, front and back if it has one, then type its totals. The photos ride on the invoice.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <TicketAttachment label="Paper ticket photo" hint="The whole ticket, flat and readable."
              path={ticketPhoto} onChange={(p) => { setTicketPhoto(p); quickSave({ ticket_photo_path: p }); }} readOnly={locked} />
            <TicketAttachment label="Second page or back" hint="Only if there is one."
              path={shortTicket} onChange={(p) => { setShortTicket(p); quickSave({ short_ticket_path: p }); }} readOnly={locked} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label><span className={label}>Paper ticket #</span>
              <input value={draft.ticket_number} onChange={(e) => set('ticket_number', e.target.value)} disabled={locked} className={input} />
            </label>
            <label><span className={label}>Hours</span>
              <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.paper_hours} onChange={(e) => set('paper_hours', e.target.value)} disabled={locked} className={input} />
            </label>
            <label><span className={label}>Loads</span>
              <input type="number" step="1" min="0" inputMode="numeric" value={draft.paper_loads} onChange={(e) => set('paper_loads', e.target.value)} disabled={locked} className={input} />
            </label>
            <label><span className={label}>Tons</span>
              <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.tonnage} onChange={(e) => set('tonnage', e.target.value)} disabled={locked} className={input} />
            </label>
          </div>
        </div>
      ) : (
        <>
          <LoadLines workOrderId={id} locked={locked} onTotalsChange={setLoadTotals} defaultMaterial={draft.material} jobDate={draft.job_date} />
          {!locked && loadTotals.loads === 0 && (
            <p className="text-center -mt-2">
              <button type="button" onClick={() => switchPaper(true)} className="text-sm text-brand-700 underline decoration-dotted underline-offset-2">
                Running a paper ticket today? Upload a photo of it instead
              </button>
            </p>
          )}
        </>
      )}

      {id && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
          {!paper && (
            <>
              <div className="flex justify-between"><span className="text-gray-500">Total loads</span><span className="font-semibold tabular-nums">{loadTotals.loads} · {loadTotals.tons.toFixed(1)} tons</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Truck hours</span><span className="font-semibold tabular-nums">{onSiteHours(preview.start_at, preview.stop_at).toFixed(1)}{preview.start_at ? ` (${clock(preview.start_at)} – ${preview.stop_at ? clock(preview.stop_at) : '…'})` : ''}</span></div>
            </>
          )}
          <div className="grid grid-cols-[1fr_5.5rem] gap-2 items-center">
            <div><div className="text-gray-700">Down time (h)</div><div className="text-[11px] text-gray-500">breakdown, stuck: time the truck wasn&apos;t working, taken off the hours</div></div>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.down_hours} onChange={(e) => set('down_hours', e.target.value)} disabled={locked} placeholder="0" className={`${input} text-right`} />
          </div>
          <div className="grid grid-cols-[1fr_5.5rem] gap-2 items-center">
            <div><div className="text-gray-700">Extra time (h)</div><div className="text-[11px] text-gray-500">waited at the pit or the job, detours: added</div></div>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.extra_hours} onChange={(e) => set('extra_hours', e.target.value)} disabled={locked} placeholder="0" className={`${input} text-right`} />
          </div>
          <div className="flex justify-between"><span className="text-gray-500">Travel (set by the office)</span><span className="tabular-nums">{draft.travel_hours ? `${Number(draft.travel_hours).toFixed(2)} h` : draft.order_id ? 'none' : 'comes with the job'}</span></div>
          <div className="flex justify-between pt-2 border-t border-gray-100"><span className="text-gray-500">Total hours</span><span className="font-semibold tabular-nums">{hours.toFixed(1)}</span></div>
          {preview.min_hours > 0 && preview.rate_unit === 'hour' && hours < preview.min_hours && (
            <div className="flex justify-between"><span className="text-gray-500">Job minimum</span><span className="tabular-nums">{preview.min_hours.toFixed(1)} h billed</span></div>
          )}
          {!paper && loadTotals.lastOut && <div className="flex justify-between"><span className="text-gray-500">Last load unloaded</span><span className="tabular-nums">{clock(loadTotals.lastOut)}</span></div>}
          {isHauler && (preview.rate > 0) && (
            <div className="flex justify-between pt-2 border-t border-gray-100"><span className="text-gray-500">Pays</span><span className="font-semibold tabular-nums">{billableQuantity(preview, previewLoads).toFixed(2)} {unit} = ${amount.toFixed(2)}</span></div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <label><span className={label}>Notes</span>
          <textarea rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} disabled={locked} placeholder="Waits at the pit, scale down, detours…" className={input} />
        </label>
      </div>

      {paymentBlock}

      {id && !paper && (
        <TicketSignature
          path={foremanSignature}
          signerName={foremanSigner.name}
          signedAt={foremanSigner.at}
          onChange={setForemanSignature}
          onSigned={(name, at) => setForemanSigner({ name, at })}
          readOnly={locked}
          label="Job foreman signs"
          hint="Hand them the phone: they type their name and sign. If they've left, you can still finish; the office sees it wasn't signed."
        />
      )}

      {id && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-gray-700">{foremanSignature && foremanSigner.name ? <>Signed by <strong>{foremanSigner.name}</strong>.</> : 'The ticket as a PDF, with the BOL photos behind it.'}</span>
          <button type="button" onClick={shareTicket} disabled={busy === 'share'} className="px-4 py-2 text-sm rounded-md border border-brand-700 text-brand-700 font-medium hover:bg-brand-50 disabled:opacity-50">
            {busy === 'share' ? 'Building the PDF…' : 'Ticket PDF — view / share'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      {id && actionButtons}
    </div>
  );

  return (
    <div className="space-y-4">
      {workOrder?.hauler_id && <HaulerOnTicket haulerId={workOrder.hauler_id} />}
      {viewToggle}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Job</h2>
          {isHauler && !!draft.order_id && (
            <button type="button" onClick={() => setShowJob((v) => !v)} className="text-xs text-brand-700 hover:underline">
              {jobFolded ? 'Show job details' : 'Hide job details'}
            </button>
          )}
        </div>
        {jobFolded ? (
          <div className="text-sm text-gray-800 space-y-0.5">
            <div className="font-medium">
              {[draft.job_number ? `Job ${draft.job_number}` : null, draft.job_name].filter(Boolean).join(' · ') || 'Dispatched job'}
              {draft.job_date ? ` · ${draft.job_date}` : ''}
            </div>
            {draft.job_address && <div className="text-xs"><MapLink address={draft.job_address} /></div>}
            <div className="text-xs text-gray-500">
              {[draft.driver_name, draft.unit_number ? `Truck ${draft.unit_number}` : null, draft.plate_number ? `Plate ${draft.plate_number}` : null].filter(Boolean).join(' · ') || 'Add your name, truck and plate under job details.'}
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* The order book and the customer directory are Bone's — a
              hauling company cannot read either, by design, because the order
              carries the customer rate. So rather than show them two pickers
              that can never fill, their ticket says where its job comes from. */}
          {isHauler ? (
            <div className="col-span-2 sm:col-span-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              {draft.order_id ? (
                <span className="text-gray-700">
                  This ticket is against the job Bone sent you. The job details and
                  rate came with it and are locked — your times, loads, truck, and
                  signatures are what you fill in. Anything off about the job itself
                  goes to dispatch.
                </span>
              ) : (
                <span className="text-gray-700">
                  Start a ticket from the load Bone sent you and the job fills itself in.
                  Open{' '}
                  <Link href="/hauler" className="text-brand-700 font-medium hover:underline">Loads</Link>
                  {' '}and use the ticket on the one you accepted. Filling this in by hand works
                  too — the office will just have to check it against the job themselves.
                </span>
              )}
            </div>
          ) : (
            <>
              <label className="col-span-2 sm:col-span-3">
                <span className={label}>Order</span>
                <select value={draft.order_id} onChange={(e) => applyOrder(e.target.value)} disabled={locked} className={input}>
                  <option value="">— No order —</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>{orderLabel(o)}</option>)}
                </select>
                <span className="block mt-1 text-[11px] text-gray-500">
                  {draft.order_id
                    ? 'This ticket is billed against that order. Anything that disagrees with it gets flagged for the office.'
                    : orders.length === 0
                      ? 'No open orders yet — create one under Orders first.'
                      : 'Pick the job this ticket is for and the rest fills in.'}
                </span>
              </label>
              <div className="col-span-2 sm:col-span-3">
                <CustomerPicker value={draft.customer_id} onChange={(id) => set('customer_id', id)} disabled={locked} />
              </div>
            </>
          )}
          <label><span className={label}>Driver name</span>
            <input value={draft.driver_name} onChange={(e) => set('driver_name', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Ticket #</span>
            <input value={draft.ticket_number} onChange={(e) => set('ticket_number', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Ticket form</span>
            <select value={ticketForm} onChange={(e) => setTicketForm(ticketFormat(e.target.value))} disabled={locked} className={input}>
              {TICKET_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label><span className={label}>Carrier (trucking company)</span>
            <input value={draft.trucking_company} onChange={(e) => set('trucking_company', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Contractor / customer #</span>
            <input value={draft.customer_number} onChange={(e) => set('customer_number', e.target.value)} disabled={orderLocked} className={jobInput} />
          </label>
          <label><span className={label}>Job #</span>
            <input value={draft.job_number} onChange={(e) => set('job_number', e.target.value)} disabled={orderLocked} className={jobInput} />
          </label>
          <label className="col-span-2"><span className={label}>Job name</span>
            <input value={draft.job_name} onChange={(e) => set('job_name', e.target.value)} disabled={orderLocked} className={jobInput} />
          </label>
          <label className="col-span-2 sm:col-span-3"><span className={label}>Job address</span>
            <input value={draft.job_address} onChange={(e) => set('job_address', e.target.value)} disabled={orderLocked} className={jobInput} />
            {draft.job_address.trim() && (
              <span className="block mt-1 text-xs"><MapLink address={draft.job_address} /></span>
            )}
          </label>
          <label><span className={label}>Day #</span>
            <input value={draft.day_number} onChange={(e) => set('day_number', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Phase code</span>
            <input value={draft.phase_code} onChange={(e) => set('phase_code', e.target.value)} disabled={orderLocked} className={jobInput} />
          </label>
          <label><span className={label}>Claim #</span>
            <input value={draft.claim_number} onChange={(e) => set('claim_number', e.target.value)} disabled={orderLocked} className={jobInput} />
          </label>
          <label><span className={label}>Truck #</span>
            <input value={draft.unit_number} onChange={(e) => set('unit_number', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Plate #</span>
            <input value={draft.plate_number} onChange={(e) => set('plate_number', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Equipment type</span>
            <input value={draft.equipment_type} onChange={(e) => set('equipment_type', e.target.value)} disabled={locked} className={input} list="equipment-types" />
            <datalist id="equipment-types">
              {EQUIPMENT_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </label>
          <label><span className={label}>Date</span>
            <input type="date" value={draft.job_date} onChange={(e) => set('job_date', e.target.value)} disabled={locked} className={input} />
          </label>
        </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Material &amp; truck</h2>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Material</span>
            <input value={draft.material} onChange={(e) => set('material', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Pit address</span>
            <input value={draft.supplier} onChange={(e) => set('supplier', e.target.value)} disabled={locked} className={input} />
            {draft.supplier.trim() && (
              <span className="block mt-1 text-xs"><MapLink address={draft.supplier} /></span>
            )}
          </label>
          <label><span className={label}>Truck type</span>
            <select value={draft.truck_type} onChange={(e) => set('truck_type', e.target.value)} disabled={locked} className={input}>
              <option value="">— Pick one —</option>
              {TRUCK_TYPES.map((t) => (
                <option key={t.name} value={t.name}>{t.tons ? `${t.name} (${t.tons})` : t.name}</option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>
          {/* The pad prints a tonnage range under each type; the exact tons
              this unit carries are optional. */}
          {draft.truck_type && (
            <label><span className={label}>Truck tons (optional)</span>
              <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.truck_type_tons}
                onChange={(e) => set('truck_type_tons', e.target.value)} disabled={locked} className={input} />
            </label>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Time &amp; amounts</h2>
        <div className="grid grid-cols-2 gap-3">
          <TimeWheel label="Start" value={draft.start_at} onChange={(v) => set('start_at', v)}
            disabled={locked} defaultDate={draft.job_date} defaultMeridiem="AM" />
          <TimeWheel label="Stop" value={draft.stop_at} onChange={(v) => set('stop_at', v)}
            disabled={locked} defaultDate={draft.job_date} defaultMeridiem="PM" />
          <TimeWheel label="Driver time start" value={draft.driver_start_at} onChange={(v) => set('driver_start_at', v)}
            disabled={locked} defaultDate={draft.job_date} defaultMeridiem="AM" />
          <TimeWheel label="Driver time end" value={draft.driver_end_at} onChange={(v) => set('driver_end_at', v)}
            disabled={locked} defaultDate={draft.job_date} defaultMeridiem="PM" />
          <label><span className={label}>Travel hours</span>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.travel_hours} onChange={(e) => set('travel_hours', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Down time (hrs)</span>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.down_hours} onChange={(e) => set('down_hours', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Extra time — waited (hrs)</span>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.extra_hours} onChange={(e) => set('extra_hours', e.target.value)} disabled={locked} className={input} />
          </label>
          <label><span className={label}>Start time (sent to the driver)</span>
            <input type="time" value={draft.report_time} onChange={(e) => set('report_time', e.target.value)} disabled={locked} className={input} />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4" checked={paper} onChange={(e) => setPaper(e.target.checked)} disabled={locked} />
            Paper copy: hours and loads are typed off the paper ticket, not taken from stamps
          </label>
          {paper && (
            <>
              <label><span className={label}>Paper hours</span>
                <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.paper_hours} onChange={(e) => set('paper_hours', e.target.value)} disabled={locked} className={input} />
              </label>
              <label><span className={label}>Paper loads</span>
                <input type="number" step="1" min="0" inputMode="numeric" value={draft.paper_loads} onChange={(e) => set('paper_loads', e.target.value)} disabled={locked} className={input} />
              </label>
            </>
          )}
          <label><span className={label}>Tonnage</span>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.tonnage} onChange={(e) => set('tonnage', e.target.value)} disabled={locked} className={input} />
            {(draft.rate_unit === 'hour' || draft.rate_unit === 'day') && (
              <span className="mt-1 block text-[11px] text-gray-500">
                Info only — this ticket bills by the {draft.rate_unit}, not the tons.
              </span>
            )}
          </label>
          <label><span className={label}>Tonnage type</span>
            <select value={draft.tonnage_type} onChange={(e) => set('tonnage_type', e.target.value)} disabled={locked} className={input}>
              {TONNAGE_TYPES.map((t) => <option key={t} value={t}>{t || '— None —'}</option>)}
            </select>
          </label>
          <label><span className={label}>Rate ($)</span>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.rate} onChange={(e) => set('rate', e.target.value)} disabled={orderLocked} className={jobInput} />
            {!orderLocked && suggestedRate && Number(draft.rate) !== Number(suggestedRate.rate) && (
              <button
                type="button"
                onClick={() => {
                  setDraft((d) => ({
                    ...d,
                    rate: String(suggestedRate.rate),
                    rate_unit: suggestedRate.rate_unit || d.rate_unit,
                  }));
                }}
                className="mt-1 text-[11px] text-brand-700 hover:underline"
              >
                Use the agreed rate for job {suggestedRate.job_number}: ${Number(suggestedRate.rate).toFixed(2)}/{suggestedRate.rate_unit}
              </button>
            )}
          </label>
          {/* The unit is what stops an hourly ticket from billing its tonnage.
              It comes off the order; the blank option keeps old hand-filled
              tickets on the original guess (tons if entered, else hours). */}
          <label><span className={label}>Per</span>
            <select value={draft.rate_unit} onChange={(e) => set('rate_unit', e.target.value)} disabled={orderLocked} className={jobInput}>
              <option value="">Auto (tons if entered, else hours)</option>
              <option value="hour">Hour</option>
              <option value="ton">Ton</option>
              <option value="load">Load</option>
              <option value="day">Day</option>
            </select>
          </label>
          {/* The FSR rides with the money fields — it's who signs off on them. */}
          <label className="col-span-2"><span className={label}>FSR</span>
            <input value={draft.fsr} onChange={(e) => set('fsr', e.target.value)} disabled={orderLocked} className={jobInput} />
          </label>
        </div>

        <div className="mt-3 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-gray-600">On site <strong className="tabular-nums">{onSiteHours(preview.start_at, preview.stop_at).toFixed(2)}</strong> hrs</span>
          <span className="text-gray-600">Total <strong className="tabular-nums">{hours.toFixed(2)}</strong> hrs</span>
          {loadTotals.loads > 0 && (
            <span className="text-gray-600">
              <strong className="tabular-nums">{loadTotals.loads}</strong> loads ·{' '}
              <strong className="tabular-nums">{loadTotals.tons.toFixed(2)}</strong> tons
            </span>
          )}
          <span className="text-gray-900 font-medium">
            Bills <span className="tabular-nums">{billableQuantity(preview, previewLoads).toFixed(2)}</span> {unit}{' '}
            = <span className="tabular-nums">${amount.toFixed(2)}</span>
          </span>
        </div>
      </div>

      {/* The 28 load lines. They hang off the saved ticket, so on a brand
          new one they appear as soon as it's been saved once as a draft. */}
      {id ? (
        <LoadLines
          workOrderId={id}
          locked={locked}
          onTotalsChange={setLoadTotals}
        />
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-600">
          <strong className="block text-gray-900 mb-1">Loads</strong>
          Save this ticket as a draft and the 28 load lines open up, with
          one-tap in and out times for each load.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Signed out</h2>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Loaded or empty</span>
            <select value={draft.signed_out_state} onChange={(e) => set('signed_out_state', e.target.value)} disabled={locked} className={input}>
              <option value="">—</option>
              <option value="loaded">Loaded</option>
              <option value="empty">Empty</option>
            </select>
          </label>
          <TimeWheel label="Sign out time" value={draft.sign_out_at} onChange={(v) => set('sign_out_at', v)}
            disabled={locked} defaultDate={draft.job_date} defaultMeridiem="PM" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TicketAttachment
          label="Ticket photo"
          hint="The paper ticket — take the picture here."
          path={ticketPhoto}
          onChange={setTicketPhoto}
          readOnly={locked}
        />
        <TicketAttachment
          label="Short ticket"
          hint="The short ticket, if there is one."
          path={shortTicket}
          onChange={setShortTicket}
          readOnly={locked}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TicketSignature
          path={signature}
          signerName={signatureSigner.name}
          signedAt={signatureSigner.at}
          onChange={setSignature}
          onSigned={(name, at) => setSignatureSigner({ name, at })}
          readOnly={locked}
          label="Driver's signature"
          hint="Type your name, then sign."
        />
        <TicketSignature
          path={foremanSignature}
          signerName={foremanSigner.name}
          signedAt={foremanSigner.at}
          onChange={setForemanSignature}
          onSigned={(name, at) => setForemanSigner({ name, at })}
          readOnly={locked}
          label="Foreman's signature"
          hint="The foreman types their name and signs on site at the end of the day."
        />
      </div>

      {/* Once the foreman has signed with their name, the ticket is worth
          handing over — the share sheet does text, email, AirDrop. */}
      {id && foremanSignature && foremanSigner.name && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-gray-700">
            Ticket signed by <strong>{foremanSigner.name}</strong> — send them a copy.
          </span>
          <button
            type="button"
            onClick={shareTicket}
            disabled={busy === 'share'}
            className="px-4 py-2 text-sm rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900 disabled:opacity-50"
          >
            {busy === 'share' ? 'Building the PDF…' : 'Share ticket (text · email · AirDrop)'}
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <label><span className={label}>Notes</span>
          <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} disabled={locked} className={input} />
        </label>
      </div>

      {paymentBlock}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      {actionButtons}
    </div>
  );
}
