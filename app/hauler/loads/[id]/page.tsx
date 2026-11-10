'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import MapLink from '@/components/MapLink';
import {
  LOAD_STATUS_LABEL, LOAD_STATUS_TONE,
  type HaulerLoad, type HaulerEquipment, type LoadStatus,
} from '@/lib/haulers';

// One load, in full: everything Bone sent with it, laid out so the company
// can decide before answering. The same Accept / Decline / driver controls
// as the list, posting to the same routes — a hauler reads loads, never
// writes them, so the rate they accept at is the rate dispatch sent.
//
// What is NOT here, on purpose: the order behind the load. The customer's
// rate lives on the order and is Bone's business; the load carries only the
// hauler's pay rate.

type Crew = { id: string; full_name: string | null; email: string; active: boolean };

// The job behind the load, as /api/haulers/loads/[id]/order hands it over:
// everything but the customer's money.
type JobDetails = {
  order_number: number;
  customer: string | null;
  job_name: string | null; job_number: string | null; phase_code: string | null; job_address: string | null;
  start_date: string | null; end_date: string | null; start_time: string | null; stop_time: string | null;
  travel_hours: number | null; down_hours: number | null;
  pay_rate: number | null; rate_unit: string | null; fsr: string | null;
  tonnage: number | null; tonnage_type: string | null; equipment_type: string | null; unit_number: string | null;
  status: string; notes: string | null;
};

const fmtWhen = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const fmtDate = (ymd: string | null) => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

export default function HaulerLoadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = createClient();
  const router = useRouter();
  const [load, setLoad] = useState<HaulerLoad | null>(null);
  const [job, setJob] = useState<JobDetails | null>(null);
  const [fleet, setFleet] = useState<HaulerEquipment[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [unit, setUnit] = useState('');
  const [driver, setDriver] = useState('');

  const refresh = useCallback(async () => {
    if (!id) return;
    const [{ data: l }, { data: e }] = await Promise.all([
      supabase.from('hauler_loads').select('*').eq('id', id).maybeSingle(),
      supabase.from('hauler_equipment').select('*').eq('active', true).order('unit_number'),
    ]);
    setLoad((l as HaulerLoad | null) || null);
    setFleet((e as HaulerEquipment[]) || []);
    if (l && (l as HaulerLoad).equipment_id) setUnit((l as HaulerLoad).equipment_id || '');
    const { data: { user } } = await supabase.auth.getUser();
    setMeId(user?.id ?? null);
    try {
      const res = await fetch('/api/haulers/drivers', { cache: 'no-store' });
      const json = await res.json();
      if (json.ok) setCrew(json.drivers);
    } catch { /* the picker falls back to 'Me' */ }
    // The job's own details come through the server, which leaves the
    // customer's rate behind.
    try {
      const res = await fetch(`/api/haulers/loads/${id}/order`, { cache: 'no-store' });
      const json = await res.json();
      setJob(json.ok ? (json.order as JobDetails | null) : null);
    } catch { setJob(null); }
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => { refresh(); }, [refresh]);

  async function respond(answer: 'accept' | 'decline') {
    if (!load) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const res = await fetch(`/api/haulers/loads/${load.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer,
          reason: answer === 'decline' ? reason : undefined,
          equipment_id: answer === 'accept' ? (unit || null) : undefined,
          driver_id: answer === 'accept' ? (driver || meId) : undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not send your answer.'); return; }
      setDeclining(false); setReason('');
      if (answer === 'accept' && json.work_order_id) {
        router.push(`/tickets/${json.work_order_id}`);
        return;
      }
      setMsg(answer === 'accept' ? 'Accepted — the office has been told.' : 'Declined — the office has been told.');
      refresh();
    } catch {
      setError('Network error — check your signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function assignDriver(driverId: string) {
    if (!load || !driverId) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/haulers/loads/${load.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: driverId }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not assign that driver.'); return; }
      setMsg('Driver updated — the ticket follows them.');
      refresh();
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function startTicket() {
    if (!load) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/haulers/loads/${load.id}/ticket`, { method: 'POST' });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not start the ticket.'); return; }
      router.push(`/tickets/${json.work_order_id}`);
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  const assignable: Crew[] = [
    ...(meId && !crew.some((c) => c.id === meId) ? [{ id: meId, full_name: 'Me', email: '', active: true }] : []),
    ...crew.filter((c) => c.active),
  ];
  const nameOf = (uid: string | null) => {
    if (!uid) return null;
    if (uid === meId) return 'you';
    const c = crew.find((x) => x.id === uid);
    return c ? (c.full_name || c.email) : 'someone no longer on the crew';
  };

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!load) {
    return (
      <div className="space-y-3">
        <Link href="/hauler" className="text-sm text-brand-700 hover:underline">← Loads</Link>
        <p className="text-sm text-gray-600">That load isn&apos;t one of yours, or it was cancelled.</p>
      </div>
    );
  }

  const unitOnFile = fleet.find((u) => u.id === load.equipment_id);
  const open = ['accepted', 'assigned'].includes(load.status);
  const select = 'px-2.5 py-1.5 border border-gray-300 rounded-md text-sm';
  const input = 'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm';

  const hrs = (n: number | null | undefined) => (n == null ? null : `${Number(n)} hr${Number(n) === 1 ? '' : 's'}`);
  const rate = load.rate ?? job?.pay_rate ?? null;
  const rateUnit = load.rate_unit || job?.rate_unit || 'hour';
  const rows: [string, React.ReactNode][] = [
    ['Customer', job?.customer],
    ['Job', [load.job_number || job?.job_number ? `#${load.job_number || job?.job_number}` : null, load.job_name || job?.job_name].filter(Boolean).join(' · ') || null],
    ['Phase', load.phase_code || job?.phase_code],
    ['Job address', <MapLink key="job-address" address={job?.job_address || load.dropoff} />],
    ['This load', fmtDate(load.job_date)],
    ['Job runs', job?.start_date ? `${fmtDate(job.start_date)}${job.end_date && job.end_date !== job.start_date ? ` to ${fmtDate(job.end_date)}` : ''}` : null],
    ['Daily hours', job?.start_time || job?.stop_time ? [job.start_time, job.stop_time].filter(Boolean).join(' to ') : null],
    ['Start time', load.start_time && load.start_time !== job?.start_time ? load.start_time : (job?.start_time ? null : load.start_time)],
    ['Pickup', <MapLink key="pickup" address={load.pickup} />],
    ['Drop off', load.dropoff && load.dropoff !== job?.job_address ? <MapLink key="dropoff" address={load.dropoff} /> : null],
    ['Material', job?.tonnage_type],
    ['Tonnage', job?.tonnage != null ? `${Number(job.tonnage)} tons${rateUnit === 'ton' ? ' (billed by the ton)' : ' (for information; billed by the ' + rateUnit + ')'}` : null],
    ['Travel time allowed', hrs(job?.travel_hours)],
    ['Down time allowed', hrs(job?.down_hours)],
    ['Equipment needed', load.equipment_type || job?.equipment_type],
    ['Your unit', unitOnFile ? [unitOnFile.unit_number, unitOnFile.equipment_type].filter(Boolean).join(' · ') : null],
    ['Field rep (FSR)', job?.fsr],
    ['Your pay rate', rate != null ? `$${Number(rate).toFixed(2)} per ${rateUnit}` : null],
    ['Sent to you', fmtWhen(load.created_at)],
    ['Your answer', load.responded_at
      ? `${load.status === 'declined' ? 'Declined' : 'Accepted'} ${fmtWhen(load.responded_at)}${load.decline_reason ? ` — ${load.decline_reason}` : ''}`
      : null],
    ['Driver', open || load.status === 'completed' ? (nameOf(load.driver_id) || 'not assigned yet') : null],
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/hauler" className="text-sm text-brand-700 hover:underline">← Loads</Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{load.job_name || (load.job_number ? `Job ${load.job_number}` : 'Load')}</h1>
          {load.job_number && load.job_name && <p className="text-sm text-gray-500">Job #{load.job_number}</p>}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${LOAD_STATUS_TONE[load.status as LoadStatus]}`}>
          {LOAD_STATUS_LABEL[load.status as LoadStatus]}
        </span>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5 text-sm">
            <div className="text-gray-500">{k}</div>
            <div className="text-gray-900">{v}</div>
          </div>
        ))}
        {load.notes && (
          <div className="px-4 py-3 text-sm">
            <div className="text-gray-500 mb-1">Note on this load</div>
            <div className="text-gray-900 whitespace-pre-wrap">{load.notes}</div>
          </div>
        )}
        {job?.notes && (
          <div className="px-4 py-3 text-sm">
            <div className="text-gray-500 mb-1">Job notes</div>
            <div className="text-gray-900 whitespace-pre-wrap">{job.notes}</div>
          </div>
        )}
        {!job && load.order_id && (
          <div className="px-4 py-3 text-xs text-gray-500">Couldn&apos;t load the job&apos;s details right now — pull to refresh.</div>
        )}
      </div>

      {load.status === 'offered' && (
        <div className="bg-white border-2 border-accent-400 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Your answer</h2>
          {declining ? (
            <>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why can't you take it? (optional)" className={input} />
              <div className="flex gap-2">
                <button onClick={() => respond('decline')} disabled={busy}
                  className="px-3 py-2 text-sm rounded-md bg-red-700 text-white font-medium hover:bg-red-800 disabled:opacity-50">
                  {busy ? 'Sending…' : 'Confirm decline'}
                </button>
                <button onClick={() => { setDeclining(false); setReason(''); }}
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fleet.length > 0 && (
                  <label className="text-xs text-gray-600">Which unit?
                    <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${select} w-full mt-1`}>
                      <option value="">— Pick a unit —</option>
                      {fleet.map((u) => (
                        <option key={u.id} value={u.id}>{u.unit_number || u.equipment_type || 'Unit'}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-xs text-gray-600">Who&apos;s driving?
                  <select value={driver || meId || ''} onChange={(e) => setDriver(e.target.value)} className={`${select} w-full mt-1`}>
                    {assignable.map((c) => (
                      <option key={c.id} value={c.id}>{c.id === meId ? 'Me' : (c.full_name || c.email)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => respond('accept')} disabled={busy}
                  className="px-4 py-2 text-sm rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900 disabled:opacity-50">
                  {busy ? 'Sending…' : 'Accept this load'}
                </button>
                <button onClick={() => setDeclining(true)} disabled={busy}
                  className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                  Decline
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Accepting starts the haul ticket with the job, date and rate filled in, and opens it.
              </p>
            </>
          )}
        </div>
      )}

      {open && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Running it</h2>
          <label className="text-xs text-gray-600 block">Driver
            <select value={load.driver_id || ''} onChange={(e) => assignDriver(e.target.value)} disabled={busy}
              className={`${select} w-full mt-1 disabled:opacity-50`}>
              <option value="">— Assign a driver —</option>
              {assignable.map((c) => (
                <option key={c.id} value={c.id}>{c.id === meId ? 'Me' : (c.full_name || c.email)}</option>
              ))}
            </select>
          </label>
          {load.work_order_id ? (
            <Link href={`/tickets/${load.work_order_id}`}
              className="inline-block px-4 py-2 text-sm rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900">
              Open the haul ticket →
            </Link>
          ) : (
            <button onClick={startTicket} disabled={busy}
              className="px-4 py-2 text-sm rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900 disabled:opacity-50">
              {busy ? 'Starting…' : 'Start the haul ticket'}
            </button>
          )}
        </div>
      )}

      {load.status === 'completed' && load.work_order_id && (
        <Link href={`/tickets/${load.work_order_id}`} className="inline-block text-sm text-brand-700 hover:underline">
          Open the haul ticket →
        </Link>
      )}
    </div>
  );
}
