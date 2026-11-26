'use client';
import { Fragment, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import {
  totalHours, ticketAmount, onSiteHours, billableUnit, billableQuantity, ticketLabel,
  type WorkOrder, type WorkOrderLoad,
} from '@/lib/work-orders';
import type { JobOrder } from '@/lib/job-orders';
import PlaceCheckPanel from '@/components/PlaceCheckPanel';
import type { PlaceCheck } from '@/lib/place-check';
import { loadFlags } from '@/lib/ticket-rules';

// The audit reads the whole order: it is laid out beside the ticket.
type OrderFacts = JobOrder;
type Biz = { id: string; name: string; address: string | null; email: string | null };
type AuditLoad = Pick<WorkOrderLoad, 'load_no' | 'load_in_at' | 'load_out_at' | 'unload_in_at' | 'unload_out_at'
  | 'tons' | 'ticket_number' | 'bol_photo_path' | 'typed_stamps'> & { work_order_id: string };

// The audit queue.
//
// The point is not to open every ticket. A ticket filed against an order, with
// nothing disagreeing with it, has already been checked by the machine — the
// rate, the phase, the job and the dates all line up. Those go in a list you
// can tick and pass in one go.
//
// Anything the machine can't vouch for goes up top with the reason: it
// disagrees with its order, or it has no order to be checked against, or it
// has nothing to bill. Those are the ones worth a person's time.

type Column = { key: string; label: string; get: (w: WorkOrder) => string };

// Everything the office can choose to see at a glance. Deliberately more than
// anyone needs at once — the chooser is how it gets cut down.
const COLUMNS: Column[] = [
  { key: 'job_date', label: 'Date', get: (w) => w.job_date || '' },
  { key: 'order', label: 'Order', get: (w) => (w.order_id ? 'yes' : '—') },
  { key: 'job_number', label: 'Job #', get: (w) => w.job_number || '' },
  { key: 'job_name', label: 'Job name', get: (w) => w.job_name || '' },
  { key: 'phase_code', label: 'Phase', get: (w) => w.phase_code || '' },
  { key: 'driver_name', label: 'Driver', get: (w) => w.driver_name || '' },
  { key: 'trucking_company', label: 'Company', get: (w) => w.trucking_company || '' },
  { key: 'unit_number', label: 'Unit #', get: (w) => w.unit_number || '' },
  { key: 'equipment_type', label: 'Equipment', get: (w) => w.equipment_type || '' },
  { key: 'truck_type', label: 'Truck type', get: (w) => w.truck_type || '' },
  { key: 'material', label: 'Material', get: (w) => w.material || '' },
  { key: 'supplier', label: 'Supplier', get: (w) => w.supplier || '' },
  { key: 'fsr', label: 'FSR', get: (w) => w.fsr || '' },
  { key: 'ticket_number', label: 'Ticket #', get: (w) => w.ticket_number || '' },
  { key: 'on_site', label: 'On site', get: (w) => onSiteHours(w.start_at, w.stop_at).toFixed(2) },
  { key: 'travel_hours', label: 'Travel', get: (w) => (w.travel_hours == null ? '' : Number(w.travel_hours).toFixed(2)) },
  { key: 'down_hours', label: 'Down', get: (w) => (w.down_hours == null ? '' : Number(w.down_hours).toFixed(2)) },
  { key: 'total_hours', label: 'Hours', get: (w) => totalHours(w).toFixed(2) },
  { key: 'loads_count', label: 'Loads', get: (w) => String(w.loads_count ?? 0) },
  { key: 'loads_tons', label: 'Tons', get: (w) => Number(w.loads_tons || 0).toFixed(2) },
  { key: 'rate', label: 'Rate', get: (w) => (w.rate == null ? '' : `$${Number(w.rate).toFixed(2)}`) },
  { key: 'bills', label: 'Bills', get: (w) => `${billableQuantity(w).toFixed(2)} ${billableUnit(w)}` },
  { key: 'amount', label: 'Amount', get: (w) => `$${ticketAmount(w).toFixed(2)}` },
  { key: 'photo', label: 'Paper photo', get: (w) => (w.ticket_photo_path ? 'yes' : w.paper ? 'MISSING' : 'n/a (digital)') },
  { key: 'foreman', label: 'Foreman', get: (w) => (w.foreman_signature_path ? 'signed' : 'MISSING') },
  { key: 'place', label: 'Place check', get: (w) => {
    const c = w.place_check as PlaceCheck | null;
    if (!c) return 'not run';
    if (c.off > 0) return `${c.off} OFF`;
    if (c.flag) return 'no fix';
    return c.checked > 0 ? `${c.checked} ok` : '—';
  } },
];

const DEFAULT_KEYS = ['job_date', 'driver_name', 'trucking_company', 'unit_number',
  'loads_count', 'loads_tons', 'total_hours', 'amount'];

// Why a ticket can't be passed without someone looking. Null means it can.
function needsEyes(w: WorkOrder, flags: string[] = []): string | null {
  if (w.order_mismatch && !w.mismatch_cleared_at) return w.order_mismatch;
  if (!w.order_id) return 'no order — nothing to check it against';
  // A digital ticket IS the ticket — there is no paper to photograph. Only a
  // paper copy is expected to carry the photo; it is all there is to go on.
  if (w.paper && !w.ticket_photo_path && !w.short_ticket_path) return 'paper copy with no photo of the paper ticket';
  // The loads: a missing time, a missing BOL photo, or a time that was typed
  // rather than tapped (no GPS behind it).
  if (!w.paper && flags.length) return flags.length === 1 ? flags[0] : `${flags[0]} (+${flags.length - 1} more on the loads)`;
  // The foreman signing is what closes the day on site. A driver can finish
  // without it — the foreman may have left — but then nobody on the
  // customer's side agreed to these hours, and the office should know. A
  // paper copy carries the signature on the paper.
  if (!w.paper && !w.foreman_signature_path) return 'the job foreman never signed it';
  if (ticketAmount(w) <= 0) return 'nothing to bill — no hours, no tonnage, or no rate';
  // Where the truck was. A stamp away from the job's pit or site, or a day
  // with no GPS at all, is a reason to look — never a quiet pass.
  const place = w.place_check as PlaceCheck | null;
  if (place?.flag) return place.flag;
  return null;
}

export default function AuditQueue() {
  const supabase = createClient();
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<string[]>(DEFAULT_KEYS);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  // The expanded ticket: its order's terms on the left, the ticket on the
  // right, approve without leaving the queue.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orderFacts, setOrderFacts] = useState<Record<string, OrderFacts>>({});
  const [biz, setBiz] = useState<Record<string, Biz>>({});
  const [loadsById, setLoadsById] = useState<Record<string, AuditLoad[]>>({});
  // What just went out: "INV-1001 emailed to …".
  const [notices, setNotices] = useState<string[]>([]);
  // The billing email being typed for a customer, keyed by business.
  const [emailDraft, setEmailDraft] = useState<Record<string, string>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // What the loads on each ticket need looked at (missing times, missing
  // BOL photos, typed times), keyed by ticket.
  const [loadIssues, setLoadIssues] = useState<Record<string, string[]>>({});

  const refresh = useCallback(async () => {
    const [{ data: tickets }, { data: setting }] = await Promise.all([
      supabase.from('work_orders').select('*').eq('status', 'submitted')
        .order('job_date', { ascending: true, nullsFirst: false }),
      supabase.from('app_settings').select('value').eq('key', 'audit_fields').maybeSingle(),
    ]);
    const list = (tickets as WorkOrder[]) || [];
    setRows(list);
    if (list.length > 0) {
      const { data: loadRows } = await supabase.from('work_order_loads')
        .select('work_order_id, load_no, load_in_at, load_out_at, unload_in_at, unload_out_at, tons, ticket_number, bol_photo_path, typed_stamps')
        .in('work_order_id', list.map((w) => w.id)).order('load_no');
      const byTicket: Record<string, AuditLoad[]> = {};
      for (const l of (loadRows as AuditLoad[]) || []) (byTicket[l.work_order_id] ||= []).push(l);
      setLoadsById(byTicket);
      setLoadIssues(Object.fromEntries(Object.entries(byTicket).map(([k, v]) => [k, loadFlags(v)])));
    } else {
      setLoadsById({});
      setLoadIssues({});
    }
    const saved = (setting as { value: string } | null)?.value;
    if (saved) setKeys(saved.split(',').map((k) => k.trim()).filter(Boolean));

    // The orders behind the queue and their customers, laid out beside each
    // ticket in the audit.
    const orderIds = [...new Set(list.map((w) => w.order_id).filter(Boolean))] as string[];
    const byId: Record<string, OrderFacts> = {};
    if (orderIds.length > 0) {
      const { data: ords } = await supabase.from('job_orders').select('*').in('id', orderIds);
      for (const o of (ords as OrderFacts[]) || []) byId[o.id] = o;
    }
    setOrderFacts(byId);
    const bizIds = [...new Set([...Object.values(byId).map((o) => o.business_id), ...list.map((w) => w.business_id)].filter(Boolean))] as string[];
    if (bizIds.length > 0) {
      const { data: bizRows } = await supabase.from('businesses').select('id, name, address, email').in('id', bizIds);
      setBiz(Object.fromEntries(((bizRows as Biz[]) || []).map((x) => [x.id, x])));
    } else {
      setBiz({});
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { refresh(); }, [refresh]);

  // A fresh photo link each time a ticket is expanded — minted on demand so
  // it can't sit open long enough to expire.
  useEffect(() => {
    setPhotoUrl(null);
    const w = rows.find((r) => r.id === expandedId);
    if (!w?.ticket_photo_path) return;
    let stale = false;
    supabase.storage.from('work-tickets')
      .createSignedUrl(w.ticket_photo_path, 600)
      .then(({ data }) => { if (!stale) setPhotoUrl(data?.signedUrl ?? null); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  async function saveKeys(next: string[]) {
    setKeys(next);
    await supabase.from('app_settings')
      .upsert([{ key: 'audit_fields', value: next.join(',') }], { onConflict: 'key' });
  }

  // Approvals go one at a time through the same route a single approval uses,
  // so a bulk pass is exactly N normal approvals — each one re-checked by the
  // server, each one raising its own QuickBooks invoice. A failure part-way
  // leaves the ones before it approved, which is right: they were fine.
  async function approveSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true); setErrors([]); setNotices([]); setProgress('');
    const failed: string[] = [];
    const sentNotes: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      setProgress(`Sending ${i + 1} of ${ids.length}…`);
      try {
        const res = await fetch(`/api/work-orders/${ids[i]}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ as: 'office' }),
        });
        const json = await res.json();
        if (!json.ok) failed.push(`${shortName(ids[i])}: ${json.error || 'failed'}`);
        else if (json.invoice_error) failed.push(`${shortName(ids[i])}: approved, but the invoice didn\u2019t go: ${json.invoice_error}`);
        else sentNotes.push(invoiceNote(ids[i], json));
      } catch {
        failed.push(`${shortName(ids[i])}: network error`);
      }
    }
    setBusy(false); setProgress('');
    setErrors(failed);
    setNotices(sentNotes);
    setSelected(new Set());
    refresh();
  }

  // One line on what happened to a ticket's invoice.
  function invoiceNote(id: string, json: { invoice?: { invoice_number?: string; local?: boolean; emailed?: boolean; emailed_to?: string | null; email_error?: string | null } | null }): string {
    const inv = json.invoice;
    if (!inv) return `${shortName(id)}: approved.`;
    if (!inv.local) return `${shortName(id)}: invoiced in QuickBooks as #${inv.invoice_number}.`;
    return inv.emailed
      ? `${shortName(id)}: invoice ${inv.invoice_number} emailed to ${inv.emailed_to}.`
      : `${shortName(id)}: invoice ${inv.invoice_number} created, but not emailed. ${inv.email_error || ''} It\u2019s on the Invoices tab to send.`;
  }

  function shortName(id: string) {
    const w = rows.find((r) => r.id === id);
    return w?.job_number ? `Job ${w.job_number}` : (w?.job_date || id.slice(0, 8));
  }

  // Approve straight from the verify panel — same route, one ticket.
  // only = approve and leave the invoice for later.
  async function approveOne(id: string, only = false) {
    setBusy(true); setErrors([]); setNotices([]); setProgress(only ? 'Approving…' : 'Sending…');
    try {
      const res = await fetch(`/api/work-orders/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(only ? { as: 'office', invoice: false } : { as: 'office' }),
      });
      const json = await res.json();
      if (!json.ok) setErrors([`${shortName(id)}: ${json.error || 'failed'}`]);
      else if (only) setNotices([`${shortName(id)}: approved. No invoice was made; send it from the Tickets list when billing is ready.`]);
      else if (json.invoice_error) setErrors([`${shortName(id)}: approved, but the invoice didn\u2019t go: ${json.invoice_error}`]);
      else {
        setNotices([invoiceNote(id, json)]);
        if (json.factor_error) setErrors([`${shortName(id)}: the factoring hand-off said ${json.factor_error}`]);
      }
    } catch {
      setErrors([`${shortName(id)}: network error`]);
    }
    setBusy(false); setProgress('');
    setExpandedId(null);
    refresh();
  }

  // Send a ticket back to its driver with what needs fixing.
  async function sendBack(id: string) {
    const reason = window.prompt('What needs fixing? The driver sees this.')?.trim();
    if (!reason) return;
    setBusy(true); setErrors([]); setNotices([]);
    try {
      const res = await fetch(`/api/work-orders/${id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ as: 'office', reject: true, reason }),
      });
      const json = await res.json();
      if (!json.ok) setErrors([`${shortName(id)}: ${json.error || 'failed'}`]);
      else setNotices([`${shortName(id)}: sent back to the driver.`]);
    } catch {
      setErrors([`${shortName(id)}: network error`]);
    }
    setBusy(false);
    setExpandedId(null);
    refresh();
  }

  // Where a customer's invoices are emailed.
  async function saveEmail(bizId: string, email: string) {
    setBusy(true); setErrors([]);
    try {
      const res = await fetch(`/api/businesses/${bizId}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!json.ok) setErrors([json.error || 'Could not save the email.']);
      else {
        setBiz((m) => ({ ...m, [bizId]: { ...m[bizId], email: json.email } }));
        setEmailDraft((d) => { const n = { ...d }; delete n[bizId]; return n; });
      }
    } catch {
      setErrors(['Network error saving the email.']);
    }
    setBusy(false);
  }

  // Open a stored photo. The tab opens before the await — Safari blocks a
  // window.open that comes after one.
  async function openFile(path: string) {
    const tab = window.open('about:blank', '_blank');
    const { data } = await supabase.storage.from('work-tickets').createSignedUrl(path, 300);
    if (data?.signedUrl) { if (tab) tab.location.href = data.signedUrl; else window.location.href = data.signedUrl; }
    else tab?.close();
  }

  async function openTicketPdf(id: string) {
    const tab = window.open('about:blank', '_blank');
    try {
      const res = await fetch(`/api/work-orders/${id}/ticket-pdf`, { method: 'POST' });
      const json = await res.json();
      if (json.ok && json.url) { if (tab) tab.location.href = json.url; else window.location.href = json.url; }
      else { tab?.close(); setErrors([json.error || 'Could not build the ticket PDF.']); }
    } catch {
      tab?.close(); setErrors(['Network error building the ticket PDF.']);
    }
  }

  // The audit, opened: the order as it was agreed on the left, the haul
  // ticket as it was turned in on the right, so the two can be read across.
  // Looks right and needs no edits → Send Invoice, right here.
  function verifyPanel(w: WorkOrder) {
    const o = w.order_id ? orderFacts[w.order_id] : undefined;
    const b = (o?.business_id && biz[o.business_id]) || (w.business_id && biz[w.business_id]) || null;
    const bizId = o?.business_id || w.business_id || null;
    const per = o?.rate_unit || w.rate_unit || 'hour';
    const loads = loadsById[w.id] || [];
    const differs = (a: unknown, c: unknown) =>
      a != null && a !== '' && c != null && c !== '' && String(a).trim().toLowerCase() !== String(c).trim().toLowerCase();
    const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');
    const hrs = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toFixed(2)} h`);
    const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);
    const reason = needsEyes(w, loadIssues[w.id]);
    // What the customer is billed: the order's rate and unit, not the
    // ticket's (a lessor's ticket carries what the lessor is paid).
    const billed = { ...w, rate_unit: o?.rate_unit || w.rate_unit, min_hours: o?.min_hours ?? w.min_hours };
    const qty = billableQuantity(billed);
    const custRate = Number(o?.rate ?? w.rate ?? 0);
    const row = (k: string, v: React.ReactNode, off = false) => (
      <div key={k} className="flex justify-between gap-3 py-0.5">
        <dt className="text-gray-500 shrink-0">{k}</dt>
        <dd className={`text-right min-w-0 [overflow-wrap:anywhere] ${off ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>{v}{off ? ' ≠ order' : ''}</dd>
      </div>
    );
    const emailValue = bizId ? (emailDraft[bizId] ?? b?.email ?? '') : '';

    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 mt-2">
        {reason && <p className="text-xs text-red-700 font-medium mb-2">Look at: {reason}</p>}
        {!w.paper && (loadIssues[w.id]?.length || 0) > 1 && (
          <ul className="text-xs text-red-700 mb-2 list-disc pl-4">
            {loadIssues[w.id].map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* ---- Left: the order, as agreed ---- */}
          <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              The order{o ? ` · #${o.order_number}` : ''}
            </p>
            {!o ? (
              <p className="text-sm text-red-700">This ticket isn&apos;t on an order, so there is nothing to compare it with. Open the full ticket and put it on one.</p>
            ) : (
              <dl>
                {row('Customer', b?.name || o.customer_number || '—')}
                {row('Job', o.job_name || '—')}
                {row('Job #', o.job_number || '—')}
                {row('Phase', o.phase_code || '—')}
                {row('Load at (pit)', o.pickup_address || '—')}
                {row('Unload at', o.dropoff_address || o.job_address || '—')}
                {row('Runs', [o.start_date, o.end_date].filter(Boolean).join(' → ') || 'no dates')}
                {row('Daily hours', o.start_time && o.stop_time ? `${o.start_time.slice(0, 5)} – ${o.stop_time.slice(0, 5)}` : '—')}
                {row('Customer rate', o.rate != null ? `${money(o.rate)}/${per}` : '—')}
                {row('Hauler pay rate', o.pay_rate != null ? `${money(o.pay_rate)}/${per}` : '—')}
                {row('Travel', hrs(o.travel_hours))}
                {row('Minimum', o.min_hours != null ? `${Number(o.min_hours).toFixed(2)} h per ticket` : 'none')}
                {row('Fuel surcharge', money(o.fuel_surcharge))}
                {o.notes && <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap">{o.notes}</p>}
              </dl>
            )}
            {/* Where the invoice goes. The office can fix it here. */}
            {bizId && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-600 mb-1">Invoice is emailed to</label>
                <div className="flex gap-2">
                  <input type="email" inputMode="email" value={emailValue} placeholder="billing@customer.com"
                    onChange={(e) => setEmailDraft((d) => ({ ...d, [bizId]: e.target.value }))}
                    className={`flex-1 min-w-0 px-2.5 py-1.5 border rounded-md text-sm ${emailValue.trim() ? 'border-gray-300' : 'border-amber-400 bg-amber-50'}`} />
                  {emailValue.trim() !== (b?.email || '') && (
                    <button type="button" onClick={() => saveEmail(bizId, emailValue)} disabled={busy}
                      className="px-3 py-1.5 text-xs rounded-md border border-brand-700 text-brand-700 font-medium disabled:opacity-50">Save</button>
                  )}
                </div>
                {!emailValue.trim() && <p className="text-[11px] text-amber-800 mt-1">No email on file. The invoice is still created; add the address to have it sent.</p>}
              </div>
            )}
          </div>

          {/* ---- Right: the haul ticket, as turned in ---- */}
          <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              The haul ticket · {ticketLabel(w)}{w.paper ? ' · paper copy' : ''}
            </p>
            <dl>
              {row('Date', w.job_date || '—', !!o && !!w.job_date && ((!!o.start_date && w.job_date < o.start_date) || (!!o.end_date && w.job_date > o.end_date)))}
              {row('Driver', w.driver_name || '—')}
              {row('Hauler', w.trucking_company || (w.hauler_id ? 'lessor' : 'Bone crew'))}
              {row('Truck', [w.unit_number ? `#${w.unit_number}` : null, w.plate_number, w.truck_type].filter(Boolean).join(' · ') || '—')}
              {row('Job #', w.job_number || '—', differs(w.job_number, o?.job_number))}
              {row('Phase', w.phase_code || '—', differs(w.phase_code, o?.phase_code))}
              {row('Pit', w.supplier || '—')}
              {row('Material', w.material || '—')}
              {w.paper
                ? row('Hours on the paper', hrs(w.paper_hours))
                : row('Start – End', `${clock(w.start_at)} – ${clock(w.stop_at)} · ${onSiteHours(w.start_at, w.stop_at).toFixed(2)} h`)}
              {row('Down time (off)', hrs(w.down_hours))}
              {row('Extra / waited (on)', hrs(w.extra_hours))}
              {row('Travel', hrs(w.travel_hours), !!o && Number(w.travel_hours || 0) !== Number(o.travel_hours || 0))}
              {row('Total hours', <strong>{totalHours(w).toFixed(2)} h</strong>)}
              {row('Loads · tons', w.paper
                ? `${w.paper_loads ?? 0} · ${Number(w.tonnage || 0).toFixed(2)}`
                : `${w.loads_count ?? 0} · ${Number(w.loads_tons || 0).toFixed(2)}`)}
              {row('Foreman', w.foreman_signature_path ? `signed${w.foreman_signature_name ? ` · ${w.foreman_signature_name}` : ''}` : w.paper ? 'on the paper' : 'NOT signed', !w.paper && !w.foreman_signature_path)}
              {w.payment_method === 'factor' && row('Pay', 'Factor Payment — approval sends this to the factoring app')}
            </dl>
            {w.notes && <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap">Driver&apos;s notes: {w.notes}</p>}

            {/* Every load, with its times and its BOL. */}
            {!w.paper && loads.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left font-medium pr-2">#</th>
                      <th className="text-left font-medium pr-2">Load in → out</th>
                      <th className="text-left font-medium pr-2">Unload in → out</th>
                      <th className="text-left font-medium pr-2">Ticket</th>
                      <th className="text-right font-medium pr-2">Tons</th>
                      <th className="text-left font-medium">BOL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((l) => (
                      <tr key={l.load_no} className="border-t border-gray-100 tabular-nums">
                        <td className="pr-2 py-0.5">{l.load_no}</td>
                        <td className="pr-2">{clock(l.load_in_at)} → {clock(l.load_out_at)}</td>
                        <td className="pr-2">{clock(l.unload_in_at)} → {clock(l.unload_out_at)}{l.typed_stamps?.length ? ' ✎' : ''}</td>
                        <td className="pr-2">{l.ticket_number || '—'}</td>
                        <td className="pr-2 text-right">{l.tons != null ? Number(l.tons).toFixed(2) : '—'}</td>
                        <td>{l.bol_photo_path
                          ? <button type="button" onClick={() => openFile(l.bol_photo_path!)} className="text-brand-700 underline decoration-dotted">photo</button>
                          : <span className="text-red-600">missing</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {w.paper && (photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photoUrl} alt="Paper ticket" className="mt-2 max-h-72 w-auto rounded border border-gray-200" />
            ) : w.ticket_photo_path ? (
              <p className="mt-2 text-xs text-gray-400">Loading the paper-ticket photo…</p>
            ) : (
              <p className="mt-2 text-xs text-red-600">Paper copy with no photo of the paper ticket.</p>
            ))}
            {w.paper && <p className="text-xs text-gray-600 mt-1">The hours, loads and tons were typed off the paper. Check them against the photo.</p>}

            <button type="button" onClick={() => openTicketPdf(w.id)} disabled={busy}
              className="mt-2 text-xs text-brand-700 underline decoration-dotted underline-offset-2 disabled:opacity-50">
              Open the ticket PDF (with every BOL photo)
            </button>

            <div className="mt-2">
              <PlaceCheckPanel
                workOrderId={w.id}
                check={w.place_check as PlaceCheck | null}
                canRecheck
                compact
                onChange={(c) => setRows((rs) => rs.map((r) => (r.id === w.id ? { ...r, place_check: c, place_check_at: c.checked_at } : r)))}
              />
            </div>
          </div>
        </div>

        {/* ---- The decision ---- */}
        <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className="text-gray-500">Invoice: </span>
            <strong className="tabular-nums">{qty.toFixed(2)} {billableUnit(billed)} × {money(custRate)} = {money(Math.round(qty * custRate * 100) / 100)}</strong>
            {b?.name ? <span className="text-gray-500"> to {b.name}</span> : null}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => approveOne(w.id)} disabled={busy}
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {busy ? (progress || 'Sending…') : 'Send Invoice'}
            </button>
            <button onClick={() => approveOne(w.id, true)} disabled={busy}
              title="Approve the ticket now and invoice it later"
              className="px-4 py-2 text-sm rounded-md border border-emerald-600 text-emerald-700 font-semibold hover:bg-emerald-50 disabled:opacity-50">
              Approve only
            </button>
            <Link href={`/work-orders/${w.id}`} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
              Needs an edit: open the ticket
            </Link>
            <button onClick={() => sendBack(w.id)} disabled={busy}
              className="px-4 py-2 text-sm rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">
              Send back to the driver
            </button>
          </div>
        </div>
      </div>
    );
  }

  const shown = COLUMNS.filter((c) => keys.includes(c.key));
  const flagged = rows.filter((w) => needsEyes(w, loadIssues[w.id]) !== null);
  const clean = rows.filter((w) => needsEyes(w, loadIssues[w.id]) === null);
  const cleanTotal = clean.reduce((n, w) => n + ticketAmount(w), 0);
  const selectedTotal = clean
    .filter((w) => selected.has(w.id))
    .reduce((n, w) => n + ticketAmount(w), 0);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-gray-600">
          {rows.length === 0
            ? 'Nothing waiting — the queue is clear.'
            : `${flagged.length} need a look · ${clean.length} check out clean`}
        </p>
        <button
          onClick={() => setPicking((v) => !v)}
          className="text-sm text-brand-700 hover:underline"
        >
          {picking ? 'Done choosing' : 'Choose fields'}
        </button>
      </div>

      {picking && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-2">
            Tick what you want in front of you. Saved for everyone in the office.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COLUMNS.map((c) => {
              const on = keys.includes(c.key);
              return (
                <button
                  key={c.key}
                  onClick={() => saveKeys(on ? keys.filter((k) => k !== c.key) : [...keys, c.key])}
                  className={`px-2.5 py-1 text-xs rounded-full border ${
                    on
                      ? 'bg-brand-700 text-white border-brand-700 font-medium'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => saveKeys(DEFAULT_KEYS)}
            className="mt-3 text-xs text-brand-700 hover:underline"
          >
            Back to the default set
          </button>
        </div>
      )}

      {notices.length > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <ul className="space-y-0.5">
            {notices.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>Some didn&apos;t go through:</strong>
          <ul className="list-disc ml-5 mt-1">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ---- Needs a look ---- */}
      {flagged.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Needs a look — {flagged.length}
          </h2>
          <div className="space-y-2">
            {flagged.map((w) => (
              <div key={w.id} className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                  className="w-full text-left"
                >
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <span className="font-medium text-sm hover:text-brand-700">
                      {w.job_number ? `Job ${w.job_number}` : 'Ticket'}
                      {w.job_date ? ` · ${w.job_date}` : ''}
                      {w.driver_name ? ` · ${w.driver_name}` : ''}
                      <span className="text-gray-400 font-normal">
                        {expandedId === w.id ? '  ▾' : '  ▸'}
                      </span>
                    </span>
                    <span className="text-sm font-semibold shrink-0">${ticketAmount(w).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-red-700 font-medium mt-1">{needsEyes(w, loadIssues[w.id])} <span className="text-brand-700 font-semibold">· {expandedId === w.id ? 'close' : 'tap to open the audit'}</span></p>
                  <div className="text-xs text-gray-600 mt-1">
                    {shown.map((c) => `${c.label} ${c.get(w) || '—'}`).join(' · ')}
                  </div>
                </button>
                {expandedId === w.id && verifyPanel(w)}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Clean ---- */}
      {clean.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Checks out — {clean.length} · ${cleanTotal.toFixed(2)}
            </h2>
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => setSelected(new Set(clean.map((w) => w.id)))}
                className="text-brand-700 hover:underline"
              >
                Select all
              </button>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-gray-600 hover:underline">
                  Clear
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-2">
            These match their order on rate, phase, job and dates, every load has its times and BOL, and there is
            something to bill.
          </p>
          <p className="text-sm text-brand-700 bg-brand-50 border border-brand-200 rounded-md px-3 py-2 mb-2">
            <strong>Tap a row to open its audit:</strong> the order on the left, the haul ticket on the right. If it looks
            right, tap <strong>Send Invoice</strong>. Or tick several and send them together below.
          </p>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-8 px-3 py-2"></th>
                  {shown.map((c) => <th key={c.key} className="px-3 py-2 text-left font-medium whitespace-nowrap">{c.label}</th>)}
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {clean.map((w) => (
                  <Fragment key={w.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                      className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${selected.has(w.id) ? 'bg-brand-50' : ''}`}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(w.id)}
                          onChange={() => toggle(w.id)}
                          aria-label="Select to send its invoice"
                        />
                      </td>
                      {shown.map((c) => (
                        <td key={c.key} className="px-3 py-2 whitespace-nowrap tabular-nums">
                          {c.get(w) || '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right text-xs font-semibold text-brand-700 whitespace-nowrap">
                        {expandedId === w.id ? 'Close ▾' : 'Open audit ▸'}
                      </td>
                    </tr>
                    {expandedId === w.id && (
                      <tr className="border-t border-gray-100">
                        <td colSpan={shown.length + 2} className="px-3 pb-3">
                          {verifyPanel(w)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={approveSelected}
              disabled={busy || selected.size === 0}
              className="px-4 py-2 text-sm rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900 disabled:opacity-40"
            >
              {busy
                ? (progress || 'Sending…')
                : selected.size === 0
                  ? 'Audit & Send Invoice'
                  : `Audit & Send Invoice · ${selected.size} · $${selectedTotal.toFixed(2)}`}
            </button>
            <span className="text-xs text-gray-500">
              Each ticket gets its own numbered invoice, emailed to the customer and filed under Invoices.
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
