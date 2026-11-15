'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import FleetNav from '@/components/FleetNav';
import { useFleet, input, label, btn, btnQuiet, fmtDate, fmtWhen, fmtMoney } from '@/lib/use-fleet';
import { VEHICLE_TYPES, tripMiles, dueTone, type FleetVehicle, type FleetTrip, type FleetFuel, type FleetMaintenance, type FleetDocument } from '@/lib/fleet';

// One truck: its details (editable by office and admin), the papers that run
// out, and everything logged against it — trips, fuel, maintenance,
// documents — newest first.

export default function FleetVehiclePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { supabase, canManage, isAdmin, people, nameOf, loading: ctxLoading } = useFleet();
  const [v, setV] = useState<FleetVehicle | null>(null);
  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [fuel, setFuel] = useState<FleetFuel[]>([]);
  const [maint, setMaint] = useState<FleetMaintenance[]>([]);
  const [docs, setDocs] = useState<FleetDocument[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: veh }, { data: t }, { data: f }, { data: m }, { data: d }] = await Promise.all([
      supabase.from('fleet_vehicles').select('*').eq('id', id).maybeSingle(),
      supabase.from('fleet_trips').select('*').eq('vehicle_id', id).order('started_at', { ascending: false }).limit(25),
      supabase.from('fleet_fuel').select('*').eq('vehicle_id', id).order('bought_at', { ascending: false }).limit(25),
      supabase.from('fleet_maintenance').select('*').eq('vehicle_id', id).order('done_at', { ascending: false }).limit(25),
      supabase.from('fleet_documents').select('*').eq('vehicle_id', id).order('expires_on', { ascending: true, nullsFirst: false }),
    ]);
    setV((veh as FleetVehicle | null) || null);
    setTrips((t as FleetTrip[]) || []); setFuel((f as FleetFuel[]) || []);
    setMaint((m as FleetMaintenance[]) || []); setDocs((d as FleetDocument[]) || []);
    setLoading(false);
  }, [supabase, id]);
  useEffect(() => { load(); }, [load]);

  function startEdit() {
    if (!v) return;
    const s = (x: unknown) => (x == null ? '' : String(x));
    setDraft({ unit_number: s(v.unit_number), name: s(v.name), vehicle_type: s(v.vehicle_type), year: s(v.year), make: s(v.make), model: s(v.model), vin: s(v.vin), plate: s(v.plate), plate_state: s(v.plate_state), odometer: s(v.odometer), assigned_driver_id: s(v.assigned_driver_id), registration_expires: s(v.registration_expires), insurance_expires: s(v.insurance_expires), inspection_due: s(v.inspection_due), notes: s(v.notes) });
    setEditing(true);
  }
  async function saveEdit() {
    if (!v) return;
    setBusy(true); setError('');
    const num = (x: string) => (x.trim() === '' ? null : Number(x));
    const txt = (x: string) => (x.trim() === '' ? null : x.trim());
    const { error: err } = await supabase.from('fleet_vehicles').update({
      unit_number: draft.unit_number.trim() || v.unit_number, name: txt(draft.name), vehicle_type: txt(draft.vehicle_type),
      year: num(draft.year), make: txt(draft.make), model: txt(draft.model), vin: txt(draft.vin), plate: txt(draft.plate),
      plate_state: txt(draft.plate_state), odometer: num(draft.odometer), assigned_driver_id: txt(draft.assigned_driver_id),
      registration_expires: txt(draft.registration_expires), insurance_expires: txt(draft.insurance_expires),
      inspection_due: txt(draft.inspection_due), notes: txt(draft.notes),
    }).eq('id', v.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setEditing(false); load();
  }
  async function setActive(active: boolean) {
    if (!v) return;
    await supabase.from('fleet_vehicles').update({ active }).eq('id', v.id);
    load();
  }
  async function remove() {
    if (!v || !confirm(`Delete unit ${v.unit_number} and everything logged against it? This can't be undone.`)) return;
    const { error: err } = await supabase.from('fleet_vehicles').delete().eq('id', v.id);
    if (err) { setError(err.message); return; }
    router.push('/fleet');
  }

  if (loading || ctxLoading) return <div className="max-w-4xl mx-auto px-4 py-4 w-full"><FleetNav /><p className="text-sm text-gray-500">Loading…</p></div>;
  if (!v) return <div className="max-w-4xl mx-auto px-4 py-4 w-full"><FleetNav /><p className="text-sm text-gray-600">That truck isn&apos;t on file.</p></div>;

  const set = (k: string, val: string) => setDraft((d) => ({ ...d, [k]: val }));
  const papers: [string, string | null][] = [['Registration', v.registration_expires], ['Insurance', v.insurance_expires], ['Inspection', v.inspection_due]];
  const toneClass = (d: string | null) => {
    const t = dueTone(d);
    return t === 'past' ? 'text-red-700 font-semibold' : t === 'soon' ? 'text-amber-800 font-semibold' : 'text-gray-900';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 w-full space-y-4">
      <FleetNav />
      <Link href="/fleet" className="text-sm text-brand-700 hover:underline">← Trucks</Link>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Unit {v.unit_number}{v.name ? <span className="text-gray-500 font-normal"> · {v.name}</span> : null}</h1>
          <p className="text-sm text-gray-600">{[v.year, v.make, v.model].filter(Boolean).join(' ')}{v.vehicle_type ? ` · ${v.vehicle_type}` : ''}{!v.active ? ' · Retired' : ''}</p>
        </div>
        {canManage && !editing && (
          <div className="flex gap-2">
            <button onClick={startEdit} className={btnQuiet}>Edit</button>
            <button onClick={() => setActive(!v.active)} className={btnQuiet}>{v.active ? 'Retire' : 'Put back in service'}</button>
            {isAdmin && <button onClick={remove} className="px-3 py-1.5 text-sm rounded-md border border-red-300 text-red-700 hover:bg-red-50">Delete</button>}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {editing ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label><span className={label}>Unit #</span><input value={draft.unit_number} onChange={(e) => set('unit_number', e.target.value)} className={input} /></label>
            <label><span className={label}>Name</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} className={input} /></label>
            <label><span className={label}>Type</span>
              <select value={draft.vehicle_type} onChange={(e) => set('vehicle_type', e.target.value)} className={input}>
                <option value="">—</option>{VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label><span className={label}>Year</span><input type="number" value={draft.year} onChange={(e) => set('year', e.target.value)} className={input} /></label>
            <label><span className={label}>Make</span><input value={draft.make} onChange={(e) => set('make', e.target.value)} className={input} /></label>
            <label><span className={label}>Model</span><input value={draft.model} onChange={(e) => set('model', e.target.value)} className={input} /></label>
            <label className="col-span-2"><span className={label}>VIN</span><input value={draft.vin} onChange={(e) => set('vin', e.target.value)} className={`${input} font-mono`} /></label>
            <label><span className={label}>Plate</span><input value={draft.plate} onChange={(e) => set('plate', e.target.value)} className={input} /></label>
            <label><span className={label}>Plate state</span><input value={draft.plate_state} onChange={(e) => set('plate_state', e.target.value.toUpperCase())} maxLength={2} className={input} /></label>
            <label><span className={label}>Odometer</span><input type="number" value={draft.odometer} onChange={(e) => set('odometer', e.target.value)} className={input} /></label>
            <label><span className={label}>Usual driver</span>
              <select value={draft.assigned_driver_id} onChange={(e) => set('assigned_driver_id', e.target.value)} className={input}>
                <option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </label>
            <label><span className={label}>Registration expires</span><input type="date" value={draft.registration_expires} onChange={(e) => set('registration_expires', e.target.value)} className={input} /></label>
            <label><span className={label}>Insurance expires</span><input type="date" value={draft.insurance_expires} onChange={(e) => set('insurance_expires', e.target.value)} className={input} /></label>
            <label><span className={label}>Inspection due</span><input type="date" value={draft.inspection_due} onChange={(e) => set('inspection_due', e.target.value)} className={input} /></label>
            <label className="col-span-2 sm:col-span-4"><span className={label}>Notes</span><input value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={input} /></label>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={saveEdit} disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setEditing(false)} className={btnQuiet}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
          {([
            ['VIN', v.vin], ['Plate', v.plate ? `${v.plate}${v.plate_state ? ` (${v.plate_state})` : ''}` : null],
            ['Odometer', v.odometer != null ? `${Number(v.odometer).toLocaleString()} mi` : null],
            ['Usual driver', nameOf(v.assigned_driver_id) || null], ['Notes', v.notes],
          ] as [string, string | null][]).filter(([, val]) => val).map(([k, val]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2"><span className="text-gray-500">{k}</span><span className={k === 'VIN' ? 'font-mono' : ''}>{val}</span></div>
          ))}
          {papers.map(([k, d]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2"><span className="text-gray-500">{k}</span><span className={toneClass(d)}>{d ? `${dueTone(d) === 'past' ? 'Expired ' : ''}${fmtDate(d)}` : 'not set'}</span></div>
          ))}
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-1"><h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Trips</h2><Link href="/fleet/trips" className="text-xs text-brand-700 hover:underline">All trips</Link></div>
        {trips.length === 0 ? <p className="text-sm text-gray-400">None yet.</p> : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
            {trips.map((t) => (
              <div key={t.id} className="px-3 py-2 flex justify-between gap-3">
                <span>{fmtWhen(t.started_at)}{t.ended_at ? ` – ${fmtWhen(t.ended_at)}` : ' · open'} · {nameOf(t.driver_id)}</span>
                <span className="tabular-nums text-gray-700">{tripMiles(t).toLocaleString()} mi{t.state_miles ? ` (${Object.keys(t.state_miles).join(', ')})` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <div className="flex items-baseline justify-between mb-1"><h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Fuel</h2><Link href="/fleet/fuel" className="text-xs text-brand-700 hover:underline">All fuel</Link></div>
        {fuel.length === 0 ? <p className="text-sm text-gray-400">None yet.</p> : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
            {fuel.map((f) => (
              <div key={f.id} className="px-3 py-2 flex justify-between gap-3">
                <span>{fmtWhen(f.bought_at)} · {f.state || '—'} · {f.vendor || ''}</span>
                <span className="tabular-nums text-gray-700">{Number(f.gallons || 0).toFixed(1)} gal · {fmtMoney(f.total_cost)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <div className="flex items-baseline justify-between mb-1"><h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Maintenance</h2><Link href="/fleet/maintenance" className="text-xs text-brand-700 hover:underline">All maintenance</Link></div>
        {maint.length === 0 ? <p className="text-sm text-gray-400">None yet.</p> : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
            {maint.map((m) => (
              <div key={m.id} className="px-3 py-2 flex justify-between gap-3">
                <span>{fmtDate(m.done_at)} · {m.kind}{m.description ? ` · ${m.description}` : ''}{m.next_due_on ? <span className={`ml-2 text-xs ${toneClass(m.next_due_on)}`}>next {fmtDate(m.next_due_on)}</span> : null}</span>
                <span className="tabular-nums text-gray-700">{fmtMoney(m.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <div className="flex items-baseline justify-between mb-1"><h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Documents</h2><Link href="/fleet/documents" className="text-xs text-brand-700 hover:underline">All documents</Link></div>
        {docs.length === 0 ? <p className="text-sm text-gray-400">None yet.</p> : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
            {docs.map((d) => (
              <div key={d.id} className="px-3 py-2 flex justify-between gap-3">
                <span>{d.kind}{d.file_name ? ` · ${d.file_name}` : ''}</span>
                <span className={toneClass(d.expires_on)}>{d.expires_on ? `${dueTone(d.expires_on) === 'past' ? 'expired ' : 'expires '}${fmtDate(d.expires_on)}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
