'use client';
import { useEffect, useState } from 'react';
import FleetNav from '@/components/FleetNav';
import { useFleet, btnQuiet, input, label } from '@/lib/use-fleet';
import { quarterRange, iftaSummary, type FleetTrip, type FleetFuel } from '@/lib/fleet';

// The quarter's IFTA numbers: miles by state off the trips, gallons by state
// off the fuel, the fleet's MPG, and from those the taxable gallons per
// state against what was bought there. The return itself applies each
// state's rate for the quarter; this gives the office every figure it asks
// for, and a CSV to keep.

export default function FleetIftaPage() {
  const { supabase, canManage, loading } = useFleet();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [q, setQ] = useState<1 | 2 | 3 | 4>((Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4);
  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [fuel, setFuel] = useState<FleetFuel[]>([]);
  const [openTrips, setOpenTrips] = useState(0);

  const range = quarterRange(year, q);

  useEffect(() => {
    (async () => {
      const startIso = `${range.start}T00:00:00`; const endIso = `${range.end}T23:59:59`;
      const [{ data: t }, { data: f }, { count }] = await Promise.all([
        supabase.from('fleet_trips').select('*').not('ended_at', 'is', null).gte('ended_at', startIso).lte('ended_at', endIso),
        supabase.from('fleet_fuel').select('*').gte('bought_at', startIso).lte('bought_at', endIso),
        supabase.from('fleet_trips').select('id', { count: 'exact', head: true }).is('ended_at', null),
      ]);
      setTrips((t as FleetTrip[]) || []); setFuel((f as FleetFuel[]) || []); setOpenTrips(count || 0);
    })();
  }, [supabase, range.start, range.end]);

  const s = iftaSummary(trips, fuel);
  const missingState = trips.filter((t) => !t.state_miles || Object.keys(t.state_miles).length === 0).length;
  const fuelNoState = fuel.filter((f) => !f.state).length;

  function exportCsv() {
    const lines = [['Jurisdiction', 'Miles', 'Gallons bought', 'Taxable gallons', 'Net gallons'].join(',')];
    for (const r of s.rows) lines.push([r.state, r.miles.toFixed(0), r.gallons.toFixed(3), r.taxableGallons.toFixed(3), r.netGallons.toFixed(3)].join(','));
    lines.push(['TOTAL', s.totalMiles.toFixed(0), s.totalGallons.toFixed(3), '', ''].join(','));
    lines.push(['Fleet MPG', s.mpg.toFixed(3)].join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `ifta-${range.label.replace(' ', '-')}.csv`;
    a.click();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 w-full space-y-4">
      <FleetNav />
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">IFTA</h1>
        <div className="flex items-end gap-2">
          <label><span className={label}>Quarter</span>
            <select value={q} onChange={(e) => setQ(Number(e.target.value) as 1 | 2 | 3 | 4)} className={input}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Q{n}</option>)}</select>
          </label>
          <label><span className={label}>Year</span><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} className={`${input} w-24`} /></label>
          {canManage && <button onClick={exportCsv} disabled={s.rows.length === 0} className={btnQuiet}>Export CSV</button>}
        </div>
      </div>
      <p className="text-sm text-gray-600">{range.label}: {range.start} to {range.end}. Trips count by the day they ended; fuel by the day it was bought.</p>

      {(missingState > 0 || fuelNoState > 0 || openTrips > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 space-y-0.5">
          {missingState > 0 && <div>{missingState} {missingState === 1 ? 'trip has' : 'trips have'} no miles by state — their miles are missing from this report until someone fills them in under Trips.</div>}
          {fuelNoState > 0 && <div>{fuelNoState} fuel {fuelNoState === 1 ? 'entry has' : 'entries have'} no state.</div>}
          {openTrips > 0 && <div>{openTrips} {openTrips === 1 ? 'trip is' : 'trips are'} still open and not counted.</div>}
        </div>
      )}

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[['Total miles', s.totalMiles.toLocaleString()], ['Gallons bought', s.totalGallons.toFixed(1)], ['Fleet MPG', s.mpg ? s.mpg.toFixed(2) : '—']].map(([k, v]) => (
              <div key={k} className="bg-white border border-gray-200 rounded-lg px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-gray-500">{k}</div><div className="text-lg font-semibold tabular-nums">{v}</div></div>
            ))}
          </div>
          {s.rows.length === 0 ? <p className="text-sm text-gray-400">No trips or fuel in this quarter yet.</p> : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-3 py-2">State</th><th className="px-3 py-2 text-right">Miles</th><th className="px-3 py-2 text-right">Gallons bought</th><th className="px-3 py-2 text-right">Taxable gallons</th><th className="px-3 py-2 text-right">Net gallons</th>
                </tr></thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.state} className="border-b border-gray-100 tabular-nums">
                      <td className="px-3 py-1.5 font-medium">{r.state}</td>
                      <td className="px-3 py-1.5 text-right">{r.miles.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">{r.gallons.toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-right">{r.taxableGallons.toFixed(1)}</td>
                      <td className={`px-3 py-1.5 text-right ${r.netGallons > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{r.netGallons > 0 ? '+' : ''}{r.netGallons.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 px-3 py-2">Net gallons: positive means tax is owed to that state (more driven there than fueled); negative means a credit. Multiply by each state&apos;s rate for the quarter on the return.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
