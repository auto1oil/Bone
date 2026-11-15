'use client';
import { useCallback, useEffect, useState } from 'react';
import FleetNav from '@/components/FleetNav';
import FleetUpload from '@/components/FleetUpload';
import { useFleet, input, label, btn, fmtDate, fmtMoney } from '@/lib/use-fleet';
import { MAINTENANCE_KINDS, dueTone, type FleetMaintenance } from '@/lib/fleet';

// Maintenance and repairs: what was done, what it cost, and when the next
// one is due — by date or by odometer. The due list at the top is the shop's
// to-do.

export default function FleetMaintenancePage() {
  const { supabase, meId, isAdmin, vehicles, loading, unitOf } = useFleet();
  const [rows, setRows] = useState<FleetMaintenance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const blank = { vehicle_id: '', kind: 'Service', done_at: today, odometer: '', description: '', cost: '', vendor: '', next_due_on: '', next_due_odometer: '' };
  const [draft, setDraft] = useState(blank);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('fleet_maintenance').select('*').order('done_at', { ascending: false }).limit(300);
    setRows((data as FleetMaintenance[]) || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft.vehicle_id) { setError('Pick the truck.'); return; }
    setBusy(true); setError('');
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    const txt = (v: string) => (v.trim() === '' ? null : v.trim());
    const { error: err } = await supabase.from('fleet_maintenance').insert({
      vehicle_id: draft.vehicle_id, kind: draft.kind, done_at: draft.done_at || today, odometer: num(draft.odometer),
      description: txt(draft.description), cost: num(draft.cost), vendor: txt(draft.vendor),
      next_due_on: txt(draft.next_due_on), next_due_odometer: num(draft.next_due_odometer), receipt_path: receipt, created_by: meId,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setDraft(blank); setReceipt(null); setAdding(false); load();
  }
  async function remove(m: FleetMaintenance) {
    if (!confirm('Delete this entry?')) return;
    const { error: err } = await supabase.from('fleet_maintenance').delete().eq('id', m.id);
    if (err) { setError(err.message); return; }
    load();
  }

  // What's due: the latest entry per truck+kind with a next-due that is past
  // or inside 30 days, or an odometer target the truck has reached.
  const latestByKey = new Map<string, FleetMaintenance>();
  for (const m of rows) { const k = `${m.vehicle_id}:${m.kind}`; if (!latestByKey.has(k)) latestByKey.set(k, m); }
  const due = [...latestByKey.values()].map((m) => {
    const v = vehicles.find((x) => x.id === m.vehicle_id);
    const byDate = dueTone(m.next_due_on);
    const byOdo = m.next_due_odometer != null && v?.odometer != null && Number(v.odometer) >= Number(m.next_due_odometer) - 500;
    return { m, byDate, byOdo, v };
  }).filter(({ byDate, byOdo, v }) => v?.active && (byDate === 'past' || byDate === 'soon' || byOdo));

  const set = (k: keyof typeof blank, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const active = vehicles.filter((v) => v.active);

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 w-full space-y-4">
      <FleetNav />
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <button onClick={() => setAdding((a) => !a)} className={btn}>{adding ? 'Cancel' : '+ Log work'}</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {due.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <div className="font-semibold text-amber-900 mb-1">Due</div>
          <ul className="space-y-0.5 text-amber-900">
            {due.map(({ m, byDate, byOdo, v }) => (
              <li key={m.id}>Unit {v?.unit_number}: {m.kind}{byDate === 'past' ? ` was due ${fmtDate(m.next_due_on)}` : byDate === 'soon' ? ` due ${fmtDate(m.next_due_on)}` : ''}{byOdo ? ` due at ${Number(m.next_due_odometer).toLocaleString()} mi (truck is at ${Number(v?.odometer).toLocaleString()})` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label><span className={label}>Truck</span>
                  <select value={draft.vehicle_id} onChange={(e) => { set('vehicle_id', e.target.value); const v = active.find((x) => x.id === e.target.value); if (v?.odometer != null) set('odometer', String(v.odometer)); }} className={input}>
                    <option value="">— Pick —</option>{active.map((v) => <option key={v.id} value={v.id}>{v.unit_number}{v.name ? ` · ${v.name}` : ''}</option>)}
                  </select>
                </label>
                <label><span className={label}>Kind</span>
                  <select value={draft.kind} onChange={(e) => set('kind', e.target.value)} className={input}>{MAINTENANCE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
                </label>
                <label><span className={label}>Date</span><input type="date" value={draft.done_at} onChange={(e) => set('done_at', e.target.value)} className={input} /></label>
                <label><span className={label}>Odometer</span><input type="number" inputMode="numeric" value={draft.odometer} onChange={(e) => set('odometer', e.target.value)} className={input} /></label>
                <label className="col-span-2 sm:col-span-4"><span className={label}>What was done</span><input value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Oil and filters, greased, checked brakes" className={input} /></label>
                <label><span className={label}>Cost $</span><input type="number" step="0.01" inputMode="decimal" value={draft.cost} onChange={(e) => set('cost', e.target.value)} className={input} /></label>
                <label><span className={label}>Shop / vendor</span><input value={draft.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="In house" className={input} /></label>
                <label><span className={label}>Next due (date)</span><input type="date" value={draft.next_due_on} onChange={(e) => set('next_due_on', e.target.value)} className={input} /></label>
                <label><span className={label}>Next due (odometer)</span><input type="number" inputMode="numeric" value={draft.next_due_odometer} onChange={(e) => set('next_due_odometer', e.target.value)} className={input} /></label>
                <div className="col-span-2"><FleetUpload label="Receipt or work order" path={receipt} onChange={setReceipt} folder="maintenance" /></div>
              </div>
              <button onClick={save} disabled={busy} className={`${btn} mt-3`}>{busy ? 'Saving…' : 'Save'}</button>
            </>
          )}
        </div>
      )}

      {rows.length === 0 ? <p className="text-sm text-gray-400">Nothing logged yet.</p> : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
          {rows.map((m) => (
            <div key={m.id} className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-medium">{fmtDate(m.done_at)} · Unit {unitOf(m.vehicle_id)} · {m.kind}</div>
                <div className="text-xs text-gray-500">{[m.description, m.vendor, m.odometer != null ? `${Number(m.odometer).toLocaleString()} mi` : null, m.next_due_on ? `next ${fmtDate(m.next_due_on)}` : null, m.next_due_odometer != null ? `next at ${Number(m.next_due_odometer).toLocaleString()} mi` : null].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{fmtMoney(m.cost)}</span>
                {m.receipt_path && <FleetUpload label="" path={m.receipt_path} readOnly />}
                {isAdmin && <button onClick={() => remove(m)} className="text-xs text-red-600 hover:underline">Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
