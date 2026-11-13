'use client';
import { useState } from 'react';
import type { PlaceCheck, StampCheck } from '@/lib/place-check';

// Where the truck was, stamp by stamp, against where the job said it should
// be. Green when inside the tolerance, red when not, grey when the phone gave
// no fix or the job gave no place. Every stamp and both places link to a map.

const LABEL: Record<StampCheck['key'], string> = {
  load_in: 'Load in', load_out: 'Load out', unload_in: 'Unload in', unload_out: 'Unload out',
};
const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const fmtClock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const mapAt = (lat: number, lng: number) => `https://maps.google.com/?q=${lat},${lng}`;
const mapAddr = (a: string) => `https://maps.google.com/?q=${encodeURIComponent(a)}`;

export default function PlaceCheckPanel({
  workOrderId, check, canRecheck = false, onChange, compact = false,
}: {
  workOrderId: string;
  check: PlaceCheck | null;
  canRecheck?: boolean;
  onChange?: (c: PlaceCheck) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(!compact);

  async function recheck() {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/place-check`, { method: 'POST' });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not run the check.'); return; }
      onChange?.(json.place_check as PlaceCheck);
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  const link = 'text-brand-700 underline decoration-dotted underline-offset-2 hover:decoration-solid';

  if (!check) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-600">
        <p className="font-semibold text-gray-900 text-sm mb-1">Place check</p>
        <p>Not run yet for this ticket.</p>
        {canRecheck && (
          <button onClick={recheck} disabled={busy}
            className="mt-2 px-2.5 py-1 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
            {busy ? 'Checking…' : 'Run the check'}
          </button>
        )}
        {error && <p className="text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  const tone = check.off > 0 ? 'border-red-300 bg-red-50' : check.flag ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50';
  const headline = check.off > 0
    ? `✗ ${check.off} of ${check.checked} stamps were not where the job says`
    : check.flag
      ? `! ${check.flag}`
      : check.checked > 0
        ? `✓ All ${check.checked} stamps were at the job's pit and site`
        : 'No load stamps yet';
  const rows = showAll ? check.stamps : check.stamps.filter((s) => s.verdict !== 'ok');

  return (
    <div className={`rounded-md border p-3 text-xs ${tone}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="font-semibold text-gray-900 text-sm">Place check</p>
        <span className="text-gray-500">within {fmtKm(check.radius_m)} · {new Date(check.checked_at).toLocaleString()}</span>
      </div>
      <p className={`mt-1 font-medium ${check.off > 0 ? 'text-red-700' : check.flag ? 'text-amber-800' : 'text-emerald-800'}`}>{headline}</p>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
        <div>
          <span className="text-gray-500">Pit: </span>
          {check.pit.lat != null && check.pit.address
            ? <a href={mapAddr(check.pit.address)} target="_blank" rel="noopener noreferrer" className={link} title={check.pit.label || ''}>{check.pit.address}</a>
            : <span className="text-gray-500">{check.pit.address ? `${check.pit.address} (couldn't be placed on the map)` : 'no load address on the job'}</span>}
        </div>
        <div>
          <span className="text-gray-500">Site: </span>
          {check.site.lat != null && check.site.address
            ? <a href={mapAddr(check.site.address)} target="_blank" rel="noopener noreferrer" className={link} title={check.site.label || ''}>{check.site.address}</a>
            : <span className="text-gray-500">{check.site.address ? `${check.site.address} (couldn't be placed on the map)` : 'no unload address on the job'}</span>}
        </div>
      </div>

      {check.stamps.length > 0 && (
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-gray-500">
              <th className="font-medium pr-2 py-0.5">Load</th>
              <th className="font-medium pr-2 py-0.5">Stamp</th>
              <th className="font-medium pr-2 py-0.5">Time</th>
              <th className="font-medium pr-2 py-0.5">Where it was</th>
              <th className="font-medium py-0.5">Map</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={`${s.load_no}-${s.key}`} className={s.verdict === 'off' ? 'text-red-700 font-medium' : s.verdict === 'ok' ? 'text-emerald-800' : 'text-gray-500'}>
                <td className="pr-2 py-0.5 tabular-nums">{s.load_no}</td>
                <td className="pr-2 py-0.5">{LABEL[s.key]}</td>
                <td className="pr-2 py-0.5 tabular-nums">{fmtClock(s.at)}</td>
                <td className="pr-2 py-0.5">
                  {s.verdict === 'ok' && `${fmtKm(s.distance_m || 0)} from the ${s.expected} ✓`}
                  {s.verdict === 'off' && `${fmtKm(s.distance_m || 0)} from the ${s.expected} ✗`}
                  {s.verdict === 'nofix' && 'no GPS fix'}
                  {s.verdict === 'unchecked' && `no ${s.expected} address to check against`}
                  {s.accuracy_m != null && s.verdict !== 'nofix' && <span className="text-gray-400"> (±{Math.round(s.accuracy_m)} m)</span>}
                </td>
                <td className="py-0.5">
                  {s.lat != null && s.lng != null && (
                    <a href={mapAt(s.lat, s.lng)} target="_blank" rel="noopener noreferrer" className={link}>stamp</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {compact && check.stamps.some((s) => s.verdict === 'ok') && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-1 text-brand-700 hover:underline">
          {showAll ? 'Hide the stamps that were in place' : `Show all ${check.stamps.length} stamps`}
        </button>
      )}

      <div className="mt-2 flex items-center gap-3">
        {canRecheck && (
          <button onClick={recheck} disabled={busy}
            className="px-2.5 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50">
            {busy ? 'Checking…' : 'Re-check'}
          </button>
        )}
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
