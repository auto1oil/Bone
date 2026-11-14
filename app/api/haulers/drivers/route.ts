// GET  /api/haulers/drivers — the signed-in hauler's own drivers.
// POST /api/haulers/drivers — create a driver login for that company.
//
// A hauling company knows who is driving today; Bone's office doesn't. So
// the company creates its own driver logins — but only ever for itself, and
// only ever as drivers.
//
// Both of those are enforced here rather than trusted from the request: the
// role is hard-coded and the company is read off the caller's own profile.
// Nothing the client posts can change either. That matters because this route
// runs as the service role — it has to, since creating an auth user does —
// so it is the only thing standing between a hauler and an admin account.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { SITE_URL_FALLBACK } from '@/lib/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Readable rather than clever: this gets read down a phone line to someone
// standing next to a truck, so no characters that sound like other ones.
function tempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function callerHauler() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 }) };
  const { data: me } = await supabase
    .from('profiles')
    .select('role, hauler_id')
    .eq('id', user.id)
    .single();
  if (!me || me.role !== 'hauler' || !me.hauler_id) {
    return { error: NextResponse.json({ ok: false, error: 'not a hauler login' }, { status: 403 }) };
  }
  return { supabase, user, haulerId: me.hauler_id as string };
}

export async function GET() {
  const gate = await callerHauler();
  if (gate.error) return gate.error;

  // RLS scopes this to the caller's own company.
  const { data, error } = await gate.supabase!
    .from('profiles')
    .select('id, full_name, email, phone, role, active')
    .eq('hauler_id', gate.haulerId)
    .order('full_name');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, drivers: data || [] });
}

export async function POST(req: Request) {
  const gate = await callerHauler();
  if (gate.error) return gate.error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email || '').trim().toLowerCase();
  const fullName = String(body.full_name || '').trim();
  const phone = String(body.phone || '').trim();
  if (!email) return NextResponse.json({ ok: false, error: 'enter their email' }, { status: 400 });

  const admin = createAdminClient();
  const alreadyMsg = 'Someone already signs in with that email. Use a different one, or ask Bone to move that login to your company.';

  // Invite by email first; a temporary password only when the invite can't go.
  const wantInvite = body.invite !== false;
  let userId: string | null = null;
  let password: string | null = null;
  let invited = false;
  if (wantInvite) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL_FALLBACK;
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: fullName ? { full_name: fullName } : undefined,
      redirectTo: `${siteUrl}/reset-password`,
    });
    if (!invErr && inv?.user) { userId = inv.user.id; invited = true; }
    else if (/already/i.test(invErr?.message || '')) {
      return NextResponse.json({ ok: false, error: alreadyMsg }, { status: 400 });
    }
  }
  if (!userId) {
    password = tempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message || 'could not create the login';
      // The generic "already registered" is the one people actually hit, and it
      // needs to say what to do about it rather than just failing.
      return NextResponse.json({ ok: false, error: /already/i.test(msg) ? alreadyMsg : msg }, { status: 400 });
    }
    userId = created.user.id;
  }

  // The signup trigger has made a profile. Stamp it as this company's driver.
  // role and hauler_id are set here, never taken from the request.
  const { error: upErr } = await admin
    .from('profiles')
    .update({
      role: 'driver',
      hauler_id: gate.haulerId,
      full_name: fullName || null,
      phone: phone || null,
      must_change_password: !invited,
      active: true,
    })
    .eq('id', userId);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, email, password, invited });
}
