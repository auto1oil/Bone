'use client';
import { useState } from 'react';
import Link from 'next/link';
import FleetNav from '@/components/FleetNav';
import ScanButton from '@/components/ScanButton';
import { useFleet, input, label, btn, btnQuiet, fmtDate } from '@/lib/use-fleet';
import { VEHICLE_TYPES, dueTone, daysUntil, type FleetVehicle } from '@/lib/fleet';
import { sv, sn, pick, type RegistrationScan } from '@/lib/fleet-scan';

// Bone's trucks. Each card shows the papers that run out — registration,
// insurance, annual inspection — in red when past and amber within thirty
// days, so the yard sees trouble before the roadside does.

type Draft = Record<string, string>;
const blank: Draft = { unit_number: '', name: '', vehicle_type: 'Tractor', year: '', make: '', model: '', vin: '', plate: '', plate_state: 'UT', odometer: '', assigned_driver_id: '', registration_expires: '', insurance_expires: '', inspection_due: '', notes: '' };

export default function FleetTrucksPage() {
  const { supabase, meId, canManage, isAdmin, vehicles, people, loading, refreshVehicles, nameOf } = useFleet();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [regPath, setRegPath] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  // A scanned registration fills what it can; the person checks the rest.
  function applyScan(f: RegistrationScan, path: string) {
    setRegPath(path);
    setScanned(true);
    setDraft((d) => ({
      ...d,
      plate: sv(f.plate) || d.plate,
      plate_state: sv(f.plate_state).toUpperCase() || d.plate_state,
      vin: sv(f.vin).toUpperCase() || d.vin,
      year: sn(f.year) || d.year,
      make: sv(f.make) || d.make,
      model: sv(f.model) || d.model,
      vehicle_type: f.vehicle_type ? pick(f.vehicle_type, VEHICLE_TYPES, d.vehicle_type as (typeof VEHICLE_TYPES)[number]) : d.vehicle_type,
      registration_expires: sv(f.registration_expires) || d.registration_expires,
    }));
  }

  async function save() {
    if (!draft.unit_number.trim()) { setError('Give it a unit number.'); return; }
    setBusy(true); setError('');
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    const txt = (v: string) => (v.trim() === '' ? null : v.trim());
    const { data: created, error: err } = await supabase.from('fleet_vehicles').insert({
      unit_number: draft.unit_number.trim(), name: txt(draft.name), vehicle_type: txt(draft.vehicle_type),
      year: num(draft.year), make: txt(draft.make), model: txt(draft.model), vin: txt(draft.vin),
      plate: txt(draft.plate), plate_state: txt(draft.plate_state), odometer: num(draft.odometer),
      assigned_driver_id: txt(draft.assigned_driver_id),
      registration_expires: txt(draft.registration_expires), insurance_expires: txt(draft.insurance_expires),
      inspection_due: txt(draft.inspection_due), notes: txt(draft.notes),
    }).select('id').single();
    if (!err && created && regPath) {
      // The scanned card becomes the truck's registration document.
      await supabase.from('fleet_documents').insert({
        vehicle_id: created.id, kind: 'Registration', file_name: `Registration · Unit ${draft.unit_number.trim()}`,
        file_path: regPath, expires_on: txt(draft.registration_expires), uploaded_by: meId,
      });
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    setDraft(blank); setRegPath(null); setScanned(false); setAdding(false);
    refreshVehicles();
  }

  const due = (v: FleetVehicle) => ([
    ['Registration', v.registration_expires], ['Insurance', v.insurance_expires], ['Inspection', v.inspection_due],
  ] as [string, string | null][]).map(([k, d]) => ({ k, d, tone: dueTone(d), days: daysUntil(d) }));

  const shown = vehicles.filter((v) => showInactive || v.active);
  const problems = vehicles.filter((v) => v.active && due(v).some((x) => x.tone === 'past' || x.tone === 'soon'));

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 w-full">
      <FleetNav />
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <h1 className="text-2xl font-semibold">Trucks</h1>
        <div className="flex items-center gap-3">
          {isAdmin && vehicles.some((v) => !v.active) && (
            <label className="text-xs text-gray-600 flex items-center gap-1">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> show retired
            </label>
          )}
          {canManage && <button onClick={() => setAdding((a) => !a)} className={btn}>{adding ? 'Cancel' : '+ Add truck'}</button>}
        </div>
      </div>

      {problems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-sm text-amber-900">
          <strong>{problems.length === 1 ? '1 truck has' : `${problems.length} trucks have`} papers past due or due within 30 days:</strong>{' '}
          {problems.map((v) => v.unit_number).join(', ')}
        </div>
      )}

      {adding && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <ScanButton kind="registration" folder="documents" label="Scan registration" onResult={(f, p) => applyScan(f as RegistrationScan, p)} />
            <span className="text-xs text-gray-500">{scanned ? 'Filled from the card. Check it, add the unit number, then save; the photo is kept as the registration document.' : 'Snap the registration card and the plate, VIN, year, make, model and expiry fill in.'}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label><span className={label}>Unit #</span><input value={draft.unit_number} onChange={(e) => set('unit_number', e.target.value)} className={input} /></label>
            <label><span className={label}>Name</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Red Kenworth" className={input} /></label>
            <label><span className={label}>Type</span>
              <select value={draft.vehicle_type} onChange={(e) => set('vehicle_type', e.target.value)} className={input}>
                {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
                <option value="">—</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </label>
            <label><span className={label}>Registration expires</span><input type="date" value={draft.registration_expires} onChange={(e) => set('registration_expires', e.target.value)} className={input} /></label>
            <label><span className={label}>Insurance expires</span><input type="date" value={draft.insurance_expires} onChange={(e) => set('insurance_expires', e.target.value)} className={input} /></label>
            <label><span className={label}>Inspection due</span><input type="date" value={draft.inspection_due} onChange={(e) => set('inspection_due', e.target.value)} className={input} /></label>
            <label className="col-span-2 sm:col-span-4"><span className={label}>Notes</span><input value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={input} /></label>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          <button onClick={save} disabled={busy} className={`${btn} mt-3`}>{busy ? 'Saving…' : 'Add truck'}</button>
        </div>
      )}

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : shown.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
          No trucks yet. {canManage ? 'Tap Add truck and put in each unit with its plate and the dates its papers run out. Everything else — trips, fuel, maintenance, documents — hangs off a truck.' : 'The office adds the trucks; trips and fuel are logged against them.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {shown.map((v) => (
            <Link key={v.id} href={`/fleet/vehicles/${v.id}`} className={`block bg-white border rounded-lg p-4 hover:shadow-sm ${v.active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">Unit {v.unit_number}{v.name ? <span className="text-gray-500 font-normal"> · {v.name}</span> : null}</div>
                  <div className="text-sm text-gray-600">{[v.year, v.make, v.model].filter(Boolean).join(' ')}{v.vehicle_type ? ` · ${v.vehicle_type}` : ''}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[v.plate ? `Plate ${v.plate}${v.plate_state ? ` (${v.plate_state})` : ''}` : null, v.odometer != null ? `${Number(v.odometer).toLocaleString()} mi` : null, nameOf(v.assigned_driver_id) ? `Driver ${nameOf(v.assigned_driver_id)}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {!v.active && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600">Retired</span>}
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2">
                {due(v).map(({ k, d, tone, days }) => (
                  <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    tone === 'past' ? 'bg-red-100 text-red-800 border-red-200' : tone === 'soon' ? 'bg-amber-100 text-amber-900 border-amber-200' : tone === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    {k}: {d ? (tone === 'past' ? `expired ${fmtDate(d)}` : days === 0 ? 'today' : `${fmtDate(d)}`) : 'not set'}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-4">{canManage ? 'Open a truck to edit it or retire it. ' : ''}Only an admin can delete one.</p>
      <span className="hidden">{btnQuiet}</span>
    </div>
  );
}
