'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { JobOrder } from '@/lib/job-orders';

// The office sending an order to Bone's own drivers. Tick the drivers, pick
// the truck each takes (it starts on their usual one), pick the day, Send.
// Each driver gets a ticket already filled from the order on their home
// screen, plus a push. Lessors get orders through hauler loads instead.

type Driver = { id: string; full_name: string | null; email: string };
type Truck = { id: string; unit_number: string; name: string | null; assigned_driver_id: string | null };

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function AssignDrivers({
  order, takenIds, onSent,
}: {
  order: JobOrder;
  // Drivers who already have a ticket on this order, by day.
  takenIds: (day: string) => Set<string>;
  onSent: () => void;
}) {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [day, setDay] = useState(() => {
    const t = today();
    if (order.start_date && t < order.start_date) return order.start_date;
    return t;
  });
  const [picked, setPicked] = useState<Record<string, string>>({}); // driver id → truck id ('' = usual)
  // When to be there: one for the send, and a per-driver time when someone
  // needs to start earlier or later. Starts on the order's daily start.
  const [startTime, setStartTime] = useState(() => (order.start_time || '').slice(0, 5));
  const [ownStart, setOwnStart] = useState<Record<string, string>>({});
  // The job's travel time. Starts on the order's; a change is saved back to
  // the order so every ticket on this job carries it.
  const [travel, setTravel] = useState(() => (order.travel_hours != null ? String(order.travel_hours) : ''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: ppl }, { data: tr }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email')
          .in('role', ['driver', 'mechanic']).is('hauler_id', null).eq('active', true).order('full_name'),
        supabase.from('fleet_vehicles').select('id, unit_number, name, assigned_driver_id').eq('active', true).order('unit_number'),
      ]);
      setDrivers((ppl as Driver[]) || []);
      setTrucks((tr as Truck[]) || []);
    })();
  }, [supabase]);

  const taken = takenIds(day);
  const chosen = Object.keys(picked);

  function toggle(id: string) {
    setPicked((p) => {
      const n = { ...p };
      if (id in n) delete n[id];
      else n[id] = trucks.find((t) => t.assigned_driver_id === id)?.id || '';
      return n;
    });
  }

  async function send() {
    if (chosen.length === 0) { setError('Tick at least one driver.'); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      const res = await fetch(`/api/job-orders/${order.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_date: day,
          start_time: startTime || null,
          travel_hours: travel.trim() === '' ? null : Number(travel),
          assignments: chosen.map((id) => ({ driver_id: id, vehicle_id: picked[id] || null, start_time: ownStart[id] || null })),
        }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not send it.'); return; }
      const sent = (json.sent as { driver: string }[]) || [];
      const skipped = (json.skipped as { driver: string; reason: string }[]) || [];
      setMsg([
        sent.length ? `Sent to ${sent.map((s) => s.driver).join(', ')}.` : '',
        ...skipped.map((s) => `${s.driver}: ${s.reason}.`),
      ].filter(Boolean).join(' '));
      setPicked({});
      setOwnStart({});
      onSent();
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  const sel = 'px-2 py-1 border border-gray-300 rounded-md text-sm bg-white';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-1">Send to Bone drivers</h2>
      <p className="text-xs text-gray-500 mb-3">
        Each driver you tick gets this job as a ticket on their home screen, already filled in, and a notification on their phone.
      </p>
      {/* On a phone the day gets its own row: an iPhone's date and time
          boxes won't shrink to a third of the card. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        <label className="text-xs text-gray-600 min-w-0 col-span-2 sm:col-span-1">Day
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`${sel} block w-full min-w-0 mt-1`} />
        </label>
        <label className="text-xs text-gray-600 min-w-0">Start time
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${sel} block w-full min-w-0 mt-1`} />
        </label>
        <label className="text-xs text-gray-600 min-w-0">Travel time (hrs)
          <input type="number" step="0.25" min="0" inputMode="decimal" value={travel} onChange={(e) => setTravel(e.target.value)}
            placeholder="0" className={`${sel} block w-full min-w-0 mt-1`} />
        </label>
      </div>
      <p className="text-[11px] text-gray-500 -mt-2 mb-3">
        Travel is for this job and is added to every driver&apos;s hours on it. Drivers can&apos;t change it.
      </p>

      {drivers.length === 0 ? (
        <p className="text-sm text-gray-500">No Bone driver logins yet. Add them under Users.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-md">
          {drivers.map((d) => {
            const on = d.id in picked;
            const has = taken.has(d.id);
            return (
              <div key={d.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${has ? 'opacity-60' : ''}`}>
                <label className="flex items-center gap-2 text-sm min-w-0">
                  <input type="checkbox" checked={on} disabled={has} onChange={() => toggle(d.id)} className="h-4 w-4" />
                  <span className="truncate">{d.full_name || d.email}</span>
                  {has && <span className="text-[11px] text-emerald-700 shrink-0">on it this day</span>}
                </label>
                {on && (
                  <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                    <input type="time" value={ownStart[d.id] ?? startTime}
                      onChange={(e) => setOwnStart((o) => ({ ...o, [d.id]: e.target.value }))}
                      title="This driver's start time" className={sel} />
                    {trucks.length > 0 && (
                      <select value={picked[d.id]} onChange={(e) => setPicked((p) => ({ ...p, [d.id]: e.target.value }))} className={`${sel} min-w-0 max-w-[11rem]`}>
                        <option value="">Usual truck</option>
                        {trucks.map((t) => <option key={t.id} value={t.id}>Unit {t.unit_number}{t.name ? ` · ${t.name}` : ''}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {msg && <p className="text-sm text-emerald-700 mt-2">{msg}</p>}
      <button onClick={send} disabled={busy || chosen.length === 0}
        className="mt-3 px-4 py-2 text-sm bg-brand-700 text-white rounded-md hover:bg-brand-900 disabled:opacity-50 font-medium">
        {busy ? 'Sending…' : chosen.length ? `Send to ${chosen.length} ${chosen.length === 1 ? 'driver' : 'drivers'}` : 'Send to drivers'}
      </button>
    </div>
  );
}
