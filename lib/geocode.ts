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
  provider: 'nominatim' | 'census' | 'coordinates';
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

// Geocode with no cache — exported for tests and one-off tools.
export async function geocodeAddress(address: string): Promise<Place | null> {
  const a = address.trim();
  if (!a) return null;
  const coords = parseCoordinates(a);
  if (coords) return { ...coords, label: `${coords.lat}, ${coords.lng}`, provider: 'coordinates' };
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
    const ageMs = Date.now() - new Date(row.geocoded_at).getTime();
    if (ageMs < 24 * 3600 * 1000) return null;
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
