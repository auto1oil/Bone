'use client';
import { useCallback, useEffect, useState } from 'react';
import FleetNav from '@/components/FleetNav';
import FleetUpload from '@/components/FleetUpload';
import { useFleet, input, label, btn, fmtWhen, fmtMoney, nowLocalInput, fromLocalInput } from '@/lib/use-fleet';
import { IFTA_JURISDICTIONS, type FleetFuel } from '@/lib/fleet';

// Fuel bought, with the receipt. The state it was bought in and the gallons
// are what IFTA needs; the cost and odometer are for the office.

export default function FleetFuelPage() {
  const { supabase, meId, canManage, isAdmin, vehicles, people, loading, nameOf, unitOf } = useFleet();
  const [rows, setRows] = useState<FleetFuel[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(true);
  const blank = { vehicle_id: '', bought_at: nowLocalInput(), state: 'UT', gallons: '', total_cost: '', odometer: '', vendor: '', notes: '' };
  const [draft, setDraft] = useState(blank);
  const [receipt, setReceipt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('fleet_fuel').select('*').order('bought_at', { ascending: false }).limit(300);
    setRows((data as FleetFuel[]) || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const active = vehicles.filter((v) => v.active);
  useEffect(() => {
    if (!draft.vehicle_id && meId) {
      const usual = active.find((v) => v.assigned_driver_id === meId);
      if (usual) setDraft((d) => ({ ...d, vehicle_id: usual.id, odometer: usual.odometer != null ? String(usual.odometer) : '' }));
    }
  }, [meId, active, draft.vehicle_id]);

  async function save() {
    if (!draft.vehicle_id) { setError('Pick the truck.'); return; }
    if (!draft.gallons.trim()) { setError('How many gallons?'); return; }
    setBusy(true); setError('');
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    const { error: err } = await supabase.from('fleet_fuel').insert({
      vehicle_id: draft.vehicle_id, driver_id: meId, bought_at: fromLocalInput(draft.bought_at) || new Date().toISOString(),
      state: draft.state.trim().toUpperCase() || null, gallons: num(draft.gallons), total_cost: num(draft.total_cost),
      odometer: num(draft.odometer), vendor: draft.vendor.trim() || null, receipt_path: receipt, notes: draft.notes.trim() || null,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setDraft({ ...blank, vehicle_id: draft.vehicle_id, bought_at: nowLocalInput() }); setReceipt(null);
    load();
  }

  async function remove(f: FleetFuel) {
    if (!confirm('Delete this fuel entry?')) return;
    const { error: err } = await supabase.from('fleet_fuel').delete().eq('id', f.id);
    if (err) { setError(err.message); return; }
    load();
  }

  const shown = rows.filter((f) => !mine || f.driver_id === meId);
  const set = (k: keyof typeof blank, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 w-full space-y-4">
      <FleetNav />
      <h1 className="text-2xl font-semibold">Fuel</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Log a fill-up</h2>
        {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label><span className={label}>Truck</span>
                <select value={draft.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} className={input}>
                  <option value="">— Pick —</option>{active.map((v) => <option key={v.id} value={v.id}>{v.unit_number}{v.name ? ` · ${v.name}` : ''}</option>)}
                </select>
              </label>
              <label><span className={label}>When</span><input type="datetime-local" value={draft.bought_at} onChange={(e) => set('bought_at', e.target.value)} className={input} /></label>
              <label><span className={label}>State</span>
                <select value={draft.state} onChange={(e) => set('state', e.target.value)} className={input}>
                  {IFTA_JURISDICTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label><span className={label}>Gallons</span><input type="number" step="0.001" inputMode="decimal" value={draft.gallons} onChange={(e) => set('gallons', e.target.value)} className={input} /></label>
              <label><span className={label}>Total $</span><input type="number" step="0.01" inputMode="decimal" value={draft.total_cost} onChange={(e) => set('total_cost', e.target.value)} className={input} /></label>
              <label><span className={label}>Odometer</span><input type="number" inputMode="numeric" value={draft.odometer} onChange={(e) => set('odometer', e.target.value)} className={input} /></label>
              <label className="col-span-2"><span className={label}>Where (station)</span><input value={draft.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Flying J, Nephi" className={input} /></label>
              <label className="col-span-2 sm:col-span-3"><span className={label}>Notes</span><input value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={input} /></label>
              <div><FleetUpload label="Receipt" path={receipt} onChange={setReceipt} folder="fuel" /></div>
            </div>
            <button onClick={save} disabled={busy || active.length === 0} className={`${btn} mt-3 px-5 py-2.5`}>{busy ? 'Saving…' : 'Save fill-up'}</button>
          </>
        )}
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{mine ? 'My fill-ups' : 'All fill-ups'}</h2>
          {people.length > 1 && <button onClick={() => setMine((m) => !m)} className="text-xs text-brand-700 hover:underline">{mine ? 'Show everyone' : 'Just mine'}</button>}
        </div>
        {shown.length === 0 ? <p className="text-sm text-gray-400">Nothing logged yet.</p> : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
            {shown.map((f) => (
              <div key={f.id} className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium">{fmtWhen(f.bought_at)} · Unit {unitOf(f.vehicle_id)} · {f.state || '—'}</div>
                  <div className="text-xs text-gray-500">{[nameOf(f.driver_id), f.vendor, f.odometer != null ? `${Number(f.odometer).toLocaleString()} mi` : null, f.notes].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{Number(f.gallons || 0).toFixed(1)} gal{f.total_cost != null ? ` · ${fmtMoney(f.total_cost)}` : ''}</span>
                  {f.receipt_path && <FleetUpload label="" path={f.receipt_path} readOnly />}
                  {isAdmin && <button onClick={() => remove(f)} className="text-xs text-red-600 hover:underline">Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
        {!canManage && <p className="text-xs text-gray-500 mt-2">Got one wrong? Tell the office; they can fix it.</p>}
      </section>
    </div>
  );
}
