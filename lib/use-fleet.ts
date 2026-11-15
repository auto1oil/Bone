'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { FleetVehicle } from '@/lib/fleet';

// What every fleet screen needs: who is signed in and what they may do, the
// trucks, and the people a truck or trip can be put on. Permissions here
// only shape the screen; the database policies are what enforce them.

export type FleetPerson = { id: string; full_name: string | null; email: string; role: string };

export function useFleet() {
  const supabase = createClient();
  const [meId, setMeId] = useState<string | null>(null);
  const [role, setRole] = useState<string>('');
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [people, setPeople] = useState<FleetPerson[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshVehicles = useCallback(async () => {
    const { data } = await supabase.from('fleet_vehicles').select('*').order('active', { ascending: false }).order('unit_number');
    setVehicles((data as FleetVehicle[]) || []);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMeId(user?.id ?? null);
      if (user) {
        const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setRole(me?.role || '');
      }
      const { data: ppl } = await supabase
        .from('profiles').select('id, full_name, email, role')
        .in('role', ['driver', 'mechanic', 'labor', 'office', 'admin', 'master_admin'])
        .is('hauler_id', null)
        .order('full_name');
      setPeople((ppl as FleetPerson[]) || []);
      await refreshVehicles();
      setLoading(false);
    })();
  }, [supabase, refreshVehicles]);

  const isAdmin = role === 'admin' || role === 'master_admin';
  const canManage = isAdmin || role === 'office';
  const nameOf = (id: string | null | undefined) => {
    if (!id) return '';
    const p = people.find((x) => x.id === id);
    return p ? (p.full_name || p.email) : '';
  };
  const unitOf = (id: string | null | undefined) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.unit_number}${v.name ? ` · ${v.name}` : ''}` : '';
  };

  return { supabase, meId, role, isAdmin, canManage, vehicles, people, loading, refreshVehicles, nameOf, unitOf };
}

// A signed link to a file in the fleet-docs bucket, good for ten minutes.
export async function fleetFileUrl(path: string): Promise<string | null> {
  const { data } = await createClient().storage.from('fleet-docs').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};
export const fmtWhen = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
export const fmtMoney = (n: number | null | undefined) => (n == null ? '' : `$${Number(n).toFixed(2)}`);
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const nowLocalInput = () => toLocalInput(new Date().toISOString());
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const input = 'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm';
export const label = 'block text-xs font-medium text-gray-600 mb-1';
export const btn = 'px-3 py-1.5 text-sm rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900 disabled:opacity-50';
export const btnQuiet = 'px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50';
