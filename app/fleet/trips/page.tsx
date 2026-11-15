'use client';
import { useCallback, useEffect, useState } from 'react';
import FleetNav from '@/components/FleetNav';
import { useFleet, input, label, btn, btnQuiet, fmtWhen, toLocalInput, nowLocalInput, fromLocalInput } from '@/lib/use-fleet';
import { IFTA_JURISDICTIONS, tripMiles, type FleetTrip } from '@/lib/fleet';

// Trips. A driver starts one with the truck and the odometer, ends it with
// the odometer and the miles by state — that state split is what the IFTA
// return is built from. One open trip per driver at a time.

type StateRow = { state: string; miles: string };

export default function FleetTripsPage() {
  const { supabase, meId, canManage, isAdmin, vehicles, people, loading, nameOf, unitOf } = useFleet();
  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Starting
  const [vehicleId, setVehicleId] = useState('');
  const [startOdo, setStartOdo] = useState('');
  // Ending / editing
  const [editing, setEditing] = useState<FleetTrip | null>(null);
  const [draft, setDraft] = useState<{ started_at: string; ended_at: string; start_odometer: string; end_odometer: string; notes: string; states: StateRow[] }>({ started_at: '', ended_at: '', start_odometer: '', end_odometer: '', notes: '', states: [] });
  const [mine, setMine] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('fleet_trips').select('*').order('started_at', { ascending: false }).limit(200);
    setTrips((data as FleetTrip[]) || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const active = vehicles.filter((v) => v.active);
  const open = trips.find((t) => t.driver_id === meId && !t.ended_at);

  useEffect(() => {
    // Default the truck to the one usually driven by this person.
    if (!vehicleId && meId) {
      const usual = active.find((v) => v.assigned_driver_id === meId);
      if (usual) { setVehicleId(usual.id); setStartOdo(usual.odometer != null ? String(usual.odometer) : ''); }
    }
  }, [meId, active, vehicleId]);

  async function start() {
    if (!vehicleId) { setError('Pick the truck.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.from('fleet_trips').insert({
      vehicle_id: vehicleId, driver_id: meId, start_odometer: startOdo.trim() === '' ? null : Number(startOdo),
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    load();
  }

  function beginEdit(t: FleetTrip, ending = false) {
    const states = Object.entries(t.state_miles || {}).map(([state, miles]) => ({ state, miles: String(miles) }));
    const v = vehicles.find((x) => x.id === t.vehicle_id);
    setDraft({
      started_at: toLocalInput(t.started_at), ended_at: ending ? nowLocalInput() : toLocalInput(t.ended_at),
      start_odometer: t.start_odometer == null ? '' : String(t.start_odometer),
      end_odometer: t.end_odometer == null ? '' : String(t.end_odometer),
      notes: t.notes || '',
      states: states.length ? states : [{ state: v?.plate_state || 'UT', miles: '' }],
    });
    setEditing(t);
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true); setError('');
    const state_miles: Record<string, number> = {};
    for (const r of draft.states) {
      const code = r.state.trim().toUpperCase(); const m = Number(r.miles);
      if (code && Number.isFinite(m) && m > 0) state_miles[code] = (state_miles[code] || 0) + m;
    }
    const startO = draft.start_odometer.trim() === '' ? null : Number(draft.start_odometer);
    const endO = draft.end_odometer.trim() === '' ? null : Number(draft.end_odometer);
    if (startO != null && endO != null && endO < startO) { setBusy(false); setError('End odometer is lower than the start.'); return; }
    const total = Object.values(state_miles).reduce((n, m) => n + m, 0);
    if (startO != null && endO != null && total > 0 && Math.abs(total - (endO - startO)) > 5) {
      setBusy(false); setError(`State miles add up to ${total}, but the odometer says ${endO - startO}. Make them match (within 5).`); return;
    }
    const { error: err } = await supabase.from('fleet_trips').update({
      started_at: fromLocalInput(draft.started_at) || editing.started_at,
      ended_at: fromLocalInput(draft.ended_at),
      start_odometer: startO, end_odometer: endO,
      state_miles: Object.keys(state_miles).length ? state_miles : null,
      notes: draft.notes.trim() || null,
    }).eq('id', editing.id);
    if (!err && endO != null) {
      // The truck's odometer follows the latest trip. Office/admin only by
      // policy; a driver's update is simply ignored by the database.
      await supabase.from('fleet_vehicles').update({ odometer: endO }).eq('id', editing.vehicle_id);
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    setEditing(null); load();
  }

  async function remove(t: FleetTrip) {
    if (!confirm('Delete this trip?')) return;
    const { error: err } = await supabase.from('fleet_trips').delete().eq('id', t.id);
    if (err) { setError(err.message); return; }
    load();
  }

  const shown = trips.filter((t) => !mine || t.driver_id === meId);
  const canEdit = (t: FleetTrip) => canManage || (t.driver_id === meId && !t.ended_at);
  const setState = (i: number, k: keyof StateRow, v: string) => setDraft((d) => ({ ...d, states: d.states.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 w-full space-y-4">
      <FleetNav />
      <h1 className="text-2xl font-semibold">Trips</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : open ? (
        <div className="bg-white border-2 border-brand-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">On the road</div>
          <div className="text-lg font-semibold">Unit {unitOf(open.vehicle_id)}</div>
          <div className="text-sm text-gray-600">Started {fmtWhen(open.started_at)}{open.start_odometer != null ? ` at ${Number(open.start_odometer).toLocaleString()} mi` : ''}</div>
          <button onClick={() => beginEdit(open, true)} className={`${btn} mt-3 px-5 py-2.5`}>End trip</button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Start a trip</h2>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <label><span className={label}>Truck</span>
              <select value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); const v = active.find((x) => x.id === e.target.value); if (v?.odometer != null) setStartOdo(String(v.odometer)); }} className={input}>
                <option value="">— Pick —</option>{active.map((v) => <option key={v.id} value={v.id}>{v.unit_number}{v.name ? ` · ${v.name}` : ''}</option>)}
              </select>
            </label>
            <label><span className={label}>Odometer now</span><input type="number" inputMode="numeric" value={startOdo} onChange={(e) => setStartOdo(e.target.value)} className={input} /></label>
          </div>
          <button onClick={start} disabled={busy || active.length === 0} className={`${btn} mt-3 px-5 py-2.5`}>{busy ? 'Starting…' : 'Start trip'}</button>
          {active.length === 0 && <p className="text-xs text-gray-500 mt-2">No trucks on file yet — the office adds them under Trucks.</p>}
        </div>
      )}

      {editing && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">{editing.ended_at ? 'Edit trip' : 'End trip'} · Unit {unitOf(editing.vehicle_id)}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label><span className={label}>Started</span><input type="datetime-local" value={draft.started_at} onChange={(e) => setDraft({ ...draft, started_at: e.target.value })} className={input} disabled={!canManage} /></label>
            <label><span className={label}>Ended</span><input type="datetime-local" value={draft.ended_at} onChange={(e) => setDraft({ ...draft, ended_at: e.target.value })} className={input} /></label>
            <label><span className={label}>Start odometer</span><input type="number" inputMode="numeric" value={draft.start_odometer} onChange={(e) => setDraft({ ...draft, start_odometer: e.target.value })} className={input} /></label>
            <label><span className={label}>End odometer</span><input type="number" inputMode="numeric" value={draft.end_odometer} onChange={(e) => setDraft({ ...draft, end_odometer: e.target.value })} className={input} /></label>
          </div>
          <div className="mt-3">
            <span className={label}>Miles by state (for IFTA)</span>
            {draft.states.map((r, i) => (
              <div key={i} className="flex gap-2 mb-1.5">
                <select value={r.state} onChange={(e) => setState(i, 'state', e.target.value)} className={`${input} w-24`}>
                  {IFTA_JURISDICTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" inputMode="numeric" placeholder="miles" value={r.miles} onChange={(e) => setState(i, 'miles', e.target.value)} className={`${input} w-32`} />
                <button type="button" onClick={() => setDraft((d) => ({ ...d, states: d.states.filter((_, j) => j !== i) }))} className="text-xs text-gray-500 hover:underline">remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setDraft((d) => ({ ...d, states: [...d.states, { state: 'ID', miles: '' }] }))} className="text-xs text-brand-700 hover:underline">+ another state</button>
            <p className="text-xs text-gray-500 mt-1">All in one state? One line with the whole trip&apos;s miles. The split should add up to the odometer difference.</p>
          </div>
          <label className="block mt-3"><span className={label}>Notes</span><input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={input} /></label>
          <div className="flex gap-2 mt-3">
            <button onClick={saveEdit} disabled={busy} className={btn}>{busy ? 'Saving…' : editing.ended_at ? 'Save' : 'End trip'}</button>
            <button onClick={() => setEditing(null)} className={btnQuiet}>Cancel</button>
          </div>
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{mine ? 'My trips' : 'All trips'}</h2>
          {people.length > 1 && <button onClick={() => setMine((m) => !m)} className="text-xs text-brand-700 hover:underline">{mine ? 'Show everyone' : 'Just mine'}</button>}
        </div>
        {shown.length === 0 ? <p className="text-sm text-gray-400">No trips yet.</p> : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
            {shown.map((t) => (
              <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium">{fmtWhen(t.started_at)}{t.ended_at ? ` – ${fmtWhen(t.ended_at)}` : <span className="text-brand-700"> · open</span>} · Unit {unitOf(t.vehicle_id)}</div>
                  <div className="text-xs text-gray-500">{nameOf(t.driver_id)} · {tripMiles(t).toLocaleString()} mi{t.state_miles ? ` · ${Object.entries(t.state_miles).map(([s, m]) => `${s} ${m}`).join(', ')}` : ''}{t.notes ? ` · ${t.notes}` : ''}</div>
                </div>
                <div className="flex gap-2">
                  {canEdit(t) && <button onClick={() => beginEdit(t, !t.ended_at)} className="text-xs text-brand-700 hover:underline">{t.ended_at ? 'Edit' : 'End'}</button>}
                  {isAdmin && <button onClick={() => remove(t)} className="text-xs text-red-600 hover:underline">Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
