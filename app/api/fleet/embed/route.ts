// GET /api/fleet/embed — the One Glovebox link the Fleet tab frames.
//
// The fleet ID lives in app_settings (fleet_embed_id), which only admins can
// read directly; drivers get the finished link from here. Staff only — a
// customer or a lessor's driver has no fleet tab. See
// docs/one-glovebox-embed.md for the link's parts.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { BRAND } from '@/lib/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FLEET_ID_KEY = 'fleet_embed_id';
const STAFF = ['driver', 'mechanic', 'labor', 'office', 'admin', 'master_admin'];
const BRAND_COLOR = '8e1414'; // the accent red in tailwind.config.js

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role, hauler_id').eq('id', user.id).single();
  if (!me || !STAFF.includes(me.role) || me.hauler_id) {
    return NextResponse.json({ ok: false, error: 'staff only' }, { status: 403 });
  }

  const db = createAdminClient();
  const { data } = await db.from('app_settings').select('value').eq('key', FLEET_ID_KEY).maybeSingle();
  const fleetId = ((data as { value: string } | null)?.value || '').trim();
  if (!fleetId) return NextResponse.json({ ok: true, url: null, isAdmin: ['admin', 'master_admin'].includes(me.role) });

  const url = `https://oneglovebox.com/app?embed=1&fleet=${encodeURIComponent(fleetId)}&brand=${encodeURIComponent(BRAND.name)}&color=${BRAND_COLOR}`;
  return NextResponse.json({ ok: true, url, isAdmin: ['admin', 'master_admin'].includes(me.role) });
}
