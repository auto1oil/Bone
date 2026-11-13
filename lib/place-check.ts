// The place check: was the truck where the job says it should have been?
//
// Every load stamp carries the GPS fix taken with it. The job's order says
// where the trucks load (the pit) and where they unload (the site). This
// measures each stamp against the right one — load in and load out against
// the pit, unload in and unload out against the site — and writes the result
// onto the ticket, where the audit reads it. A stamp outside the tolerance
// is a red flag; the office sees the distance and a map link for both the
// stamp and the place it was supposed to be, and decides.
//
// Runs server-side after every stamp (the progress ping), on every save, and
// on demand from the audit. Cheap: the two addresses are geocoded once and
// cached (lib/geocode.ts); after that it is arithmetic.
//
// Not a gate. Nothing here blocks a save, a submit, or an approval — a bad
// GPS day is a reason to look, not a reason to lose the ticket.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePlace, distanceM, type Place } from '@/lib/geocode';
import type { WorkOrder, WorkOrderLoad } from '@/lib/work-orders';

// How far from the pit or the site a stamp may be and still count as there.
// Pits and sites are big — a quarry face can be a kilometre from its gate —
// and phone fixes wander. Overridable per app with app_settings
// place_check_radius_m.
export const PLACE_RADIUS_M = 800;

export type StampKey = 'load_in' | 'load_out' | 'unload_in' | 'unload_out';
export type StampVerdict = 'ok' | 'off' | 'nofix' | 'unchecked';

export type StampCheck = {
  load_no: number;
  key: StampKey;
  at: string;
  expected: 'pit' | 'site';
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  verdict: StampVerdict;
};

export type PlaceCheck = {
  checked_at: string;
  radius_m: number;
  pit: (Place & { address: string }) | { address: string | null; lat: null; lng: null; label: null };
  site: (Place & { address: string }) | { address: string | null; lat: null; lng: null; label: null };
  stamps: StampCheck[];
  // Counts the office reads at a glance.
  checked: number;   // stamps measured against a known place
  ok: number;
  off: number;       // the red flags
  nofix: number;     // stamped, but the phone gave no fix
  unchecked: number; // stamped, but the job gives no place to measure against
  // One line for the audit list. Null when nothing is wrong.
  flag: string | null;
};

const STAMPS: { key: StampKey; expected: 'pit' | 'site' }[] = [
  { key: 'load_in', expected: 'pit' },
  { key: 'load_out', expected: 'pit' },
  { key: 'unload_in', expected: 'site' },
  { key: 'unload_out', expected: 'site' },
];

function fmtKm(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Pure: given the places and the loads, decide. Exported for tests.
export function checkStamps(
  loads: WorkOrderLoad[],
  pit: Place | null,
  site: Place | null,
  radiusM: number,
): Omit<PlaceCheck, 'checked_at' | 'radius_m' | 'pit' | 'site'> {
  const stamps: StampCheck[] = [];
  for (const l of loads) {
    for (const s of STAMPS) {
      const at = l[`${s.key}_at`] as string | null;
      if (!at) continue;
      const lat = l[`${s.key}_lat`] as number | null;
      const lng = l[`${s.key}_lng`] as number | null;
      const acc = l[`${s.key}_accuracy`] as number | null;
      const target = s.expected === 'pit' ? pit : site;
      let verdict: StampVerdict;
      let distance: number | null = null;
      if (lat == null || lng == null) verdict = 'nofix';
      else if (!target) verdict = 'unchecked';
      else {
        distance = Math.round(distanceM(Number(lat), Number(lng), target.lat, target.lng));
        // The phone's own error margin counts in the driver's favour.
        verdict = distance - (Number(acc) || 0) <= radiusM ? 'ok' : 'off';
      }
      stamps.push({
        load_no: l.load_no, key: s.key, at, expected: s.expected,
        lat: lat == null ? null : Number(lat), lng: lng == null ? null : Number(lng),
        accuracy_m: acc == null ? null : Number(acc), distance_m: distance, verdict,
      });
    }
  }
  const count = (v: StampVerdict) => stamps.filter((x) => x.verdict === v).length;
  const ok = count('ok'); const off = count('off'); const nofix = count('nofix'); const unchecked = count('unchecked');
  const checked = ok + off;

  let flag: string | null = null;
  if (off > 0) {
    const worst = stamps.filter((x) => x.verdict === 'off').sort((a, b) => (b.distance_m || 0) - (a.distance_m || 0))[0];
    flag = `${off} of ${checked} load stamps were not at the job's ${worst.expected} — load ${worst.load_no} ${worst.key.replace('_', ' ')} was ${fmtKm(worst.distance_m || 0)} away`;
  } else if (stamps.length > 0 && checked === 0 && unchecked === 0) {
    flag = 'no GPS fix on any load stamp — where the truck was is unknown';
  } else if (stamps.length > 0 && checked === 0 && unchecked > 0) {
    flag = 'the job has no load or unload address to check the stamps against';
  }
  return { stamps, checked, ok, off, nofix, unchecked, flag };
}

async function radiusSetting(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'place_check_radius_m').maybeSingle();
  const n = Number((data as { value: string } | null)?.value);
  return Number.isFinite(n) && n > 0 ? n : PLACE_RADIUS_M;
}

// Run the check for one ticket and store it on the row. Returns the result,
// or null when the ticket doesn't exist. Never throws.
export async function runPlaceCheck(db: SupabaseClient, workOrderId: string): Promise<PlaceCheck | null> {
  try {
    const [{ data: row }, { data: loadRows }] = await Promise.all([
      db.from('work_orders').select('*').eq('id', workOrderId).maybeSingle(),
      db.from('work_order_loads').select('*').eq('work_order_id', workOrderId).order('load_no'),
    ]);
    if (!row) return null;
    const wo = row as WorkOrder;
    const loads = (loadRows as WorkOrderLoad[]) || [];

    // Where the job says the trucks load and unload. The order is the
    // authority; the ticket's own pit and job address are the fallback for a
    // ticket filed without one.
    let pitAddress: string | null = wo.supplier;
    let siteAddress: string | null = wo.job_address;
    if (wo.order_id) {
      const { data: o } = await db
        .from('job_orders').select('pickup_address, dropoff_address, job_address').eq('id', wo.order_id).maybeSingle();
      const order = o as { pickup_address: string | null; dropoff_address: string | null; job_address: string | null } | null;
      if (order) {
        pitAddress = order.pickup_address || pitAddress;
        siteAddress = order.dropoff_address || order.job_address || siteAddress;
      }
    }

    const [pit, site, radius] = await Promise.all([
      resolvePlace(db, pitAddress), resolvePlace(db, siteAddress), radiusSetting(db),
    ]);
    const verdicts = checkStamps(loads, pit, site, radius);
    const result: PlaceCheck = {
      checked_at: new Date().toISOString(),
      radius_m: radius,
      pit: pit ? { ...pit, address: pitAddress! } : { address: pitAddress, lat: null, lng: null, label: null },
      site: site ? { ...site, address: siteAddress! } : { address: siteAddress, lat: null, lng: null, label: null },
      ...verdicts,
    };
    await db.from('work_orders')
      .update({ place_check: result, place_check_at: result.checked_at })
      .eq('id', workOrderId);
    return result;
  } catch {
    return null;
  }
}
