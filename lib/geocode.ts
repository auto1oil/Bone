// Turning an address into a point on the map, once.
//
// The place check needs the job's pit and site as coordinates. Addresses are
// typed by the office and repeat across many loads and tickets, so each one
// is geocoded the first time it is seen and the answer kept in geocode_cache
// for good — a pit does not move. Nominatim (OpenStreetMap) answers place
// names like "Point of the Mountain pit" as well as street addresses; the US
// Census geocoder is the fallback for a street address Nominatim misses.
// Both are free and keyless; the cache is what keeps the traffic to a trickle.
//
// Server-only: never import from a client component.

import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAND } from '@/lib/brand';

export type Place = {
  lat: number;
  lng: number;
  // What the geocoder understood the address as — shown to the office so a
  // wrong match ("Main St" in the wrong town) is visible, not silent.
  label: string;
  provider: 'nominatim' | 'census' | 'coordinates' | 'maplink';
};

// Same address, same key: case, spacing and trailing punctuation don't count.
export function addressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');
}

const UA = `BoneFieldTickets/1.0 (${BRAND.domain}; ${BRAND.officeEmail})`;

async function withTimeout(url: string, headers: Record<string, string>, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function nominatim(address: string): Promise<Place | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  const res = await withTimeout(url, { 'User-Agent': UA, Accept: 'application/json' }, 8_000);
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as { lat: string; lon: string; display_name?: string }[];
  const r = rows[0];
  if (!r) return null;
  const lat = Number(r.lat); const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: r.display_name || address, provider: 'nominatim' };
}

async function census(address: string): Promise<Place | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`;
  const res = await withTimeout(url, { Accept: 'application/json' }, 8_000);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as
    { result?: { addressMatches?: { coordinates: { x: number; y: number }; matchedAddress?: string }[] } } | null;
  const m = body?.result?.addressMatches?.[0];
  if (!m) return null;
  const lat = Number(m.coordinates.y); const lng = Number(m.coordinates.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: m.matchedAddress || address, provider: 'census' };
}

// "40.4616, -111.8956" typed or pasted straight from Google Maps. A pit with
// no street address is the normal case, and a long-press on the map gives
// the office exactly this.
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// ---- A pasted map pin ------------------------------------------------
// The office often drops a pin and pastes the share link instead of typing
// an address. A pin is the most exact place there is, so the link is read
// for its coordinates rather than treated as an address nobody can find.

// The only hosts a link is ever followed to. A pit address can be typed by
// anyone who files a ticket, so the server must not fetch whatever it is
// handed.
const MAP_HOSTS = new Set([
  'maps.app.goo.gl', 'goo.gl', 'g.co',
  'google.com', 'www.google.com', 'maps.google.com',
  'maps.apple.com', 'maps.apple',
]);

export function isMapLink(text: string): boolean {
  const t = text.trim();
  if (!/^https:\/\/\S+$/i.test(t)) return false;
  try { return MAP_HOSTS.has(new URL(t).hostname.toLowerCase()); } catch { return false; }
}

function validPoint(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

// The point a map URL (or a page that embeds one) is about. The pin itself
// (!3d…!4d…, q=, ll=) is preferred over @…, which is only where the screen
// happened to be centred.
export function coordinatesInMapUrl(raw: string): { lat: number; lng: number } | null {
  let text = raw;
  try { text = decodeURIComponent(raw); } catch { /* keep it as it came */ }
  const n = '(-?\\d{1,3}\\.\\d{3,})';
  const patterns = [
    new RegExp(`!3d${n}!4d${n}`),
    new RegExp(`[?&](?:q|query|ll|sll|daddr|destination|center|coordinate|markers)=(?:loc:)?${n},\\+?\\s*${n}`),
    new RegExp(`/(?:place|search|dir)/${n},\\+?\\s*${n}`),
    new RegExp(`@${n},${n}`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const p = m ? validPoint(Number(m[1]), Number(m[2])) : null;
    if (p) return p;
  }
  return null;
}

// The words a map link names its place with, when it carries no point:
// ?q=Staker+Parson+Pit or /place/Staker+Parson+Pit/.
function placeTextInMapUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const q = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('address');
    const fromPath = u.pathname.match(/\/(?:place|search)\/([^/@]+)/)?.[1];
    const words = (q || (fromPath ? decodeURIComponent(fromPath) : '')).replace(/\+/g, ' ').trim();
    return words && !/^https?:/i.test(words) ? words : null;
  } catch {
    return null;
  }
}

// Follow a map link to where it leads, staying on the map hosts, and read
// the point off it. Short links (maps.app.goo.gl/…) say nothing themselves;
// the place is in what they redirect to.
export async function resolveMapLink(link: string): Promise<Place | null> {
  let url = link.trim();
  let words: string | null = null;
  for (let hop = 0; hop < 6; hop++) {
    if (!isMapLink(url)) break;
    const direct = coordinatesInMapUrl(url);
    if (direct) return { ...direct, label: `Map pin ${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)}`, provider: 'maplink' };
    words = placeTextInMapUrl(url) || words;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoneFieldTickets/1.0)', Accept: 'text/html' }, signal: controller.signal });
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      try { url = new URL(next, url).toString(); } catch { break; }
      continue;
    }
    // The end of the line. The page itself is not read: without a point in
    // its address Google serves a map centred on the middle of the country,
    // which would put the pit in Kansas.
    break;
  }
  // No point anywhere, but the link named the place: look that up instead.
  if (words) {
    const typed = parseCoordinates(words);
    if (typed) return { ...typed, label: `Map pin ${typed.lat}, ${typed.lng}`, provider: 'maplink' };
    return geocodePlaceWords(words);
  }
  return null;
}

async function geocodeText(a: string): Promise<Place | null> {
  try {
    const first = await nominatim(a);
    if (first) return first;
  } catch { /* fall through to the census geocoder */ }
  try {
    return await census(a);
  } catch {
    return null;
  }
}

// What a shared place link names: "Staker Parson, 123 S Main St, Lehi, UT".
// The business name in front often defeats a geocoder that would find the
// street address behind it, so that is tried second.
async function geocodePlaceWords(words: string): Promise<Place | null> {
  const whole = await geocodeText(words);
  if (whole) return whole;
  const rest = words.includes(',') ? words.slice(words.indexOf(',') + 1).trim() : '';
  return /\d/.test(rest) ? geocodeText(rest) : null;
}

// Geocode with no cache — exported for tests and one-off tools.
export async function geocodeAddress(address: string): Promise<Place | null> {
  const a = address.trim();
  if (!a) return null;
  const coords = parseCoordinates(a);
  if (coords) return { ...coords, label: `${coords.lat}, ${coords.lng}`, provider: 'coordinates' };
  // A link is a pin or nothing — its text is never searched as an address.
  if (/^https?:\/\//i.test(a)) return isMapLink(a) ? resolveMapLink(a) : null;
  return geocodeText(a);
}

// The cached lookup the place check uses. A miss that geocodes to nothing is
// cached too (lat/lng null) so a bad address isn't retried on every stamp —
// but only for a day, in case the office fixes the spelling.
export async function resolvePlace(db: SupabaseClient, address: string | null | undefined): Promise<Place | null> {
  const a = (address || '').trim();
  if (!a) return null;
  const key = addressKey(a);

  const { data: hit } = await db
    .from('geocode_cache')
    .select('lat, lng, label, provider, geocoded_at')
    .eq('address_key', key)
    .maybeSingle();
  const row = hit as { lat: number | null; lng: number | null; label: string | null; provider: string | null; geocoded_at: string } | null;
  if (row) {
    if (row.lat != null && row.lng != null) {
      return { lat: Number(row.lat), lng: Number(row.lng), label: row.label || a, provider: (row.provider as Place['provider']) || 'nominatim' };
    }
    // A map link that led nowhere is tried again sooner: the miss is more
    // likely a slow redirect than a bad pin.
    const ageMs = Date.now() - new Date(row.geocoded_at).getTime();
    if (ageMs < (isMapLink(a) ? 10 * 60 * 1000 : 24 * 3600 * 1000)) return null;
  }

  const place = await geocodeAddress(a);
  await db.from('geocode_cache').upsert({
    address_key: key,
    address: a,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    label: place?.label ?? null,
    provider: place?.provider ?? null,
    geocoded_at: new Date().toISOString(),
  }, { onConflict: 'address_key' });
  return place;
}

// Great-circle distance in meters.
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
