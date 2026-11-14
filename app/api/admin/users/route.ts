// POST /api/admin/users — admin-only: create a staff login (driver/contractor/
// admin) without leaving the app. Uses the service-role key to create the auth
// user; the handle_new_user trigger makes the profile, then we set role/phone.
// Returns a temporary password to hand to the new user (they're forced to
// change it on first sign-in).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { SITE_URL_FALLBACK } from '@/lib/brand';

export const runtime = 'nodejs';

const ROLES = ['driver', 'contractor', 'funder', 'hauler', 'admin', 'office', 'mechanic', 'labor'] as const;
type NewRole = (typeof ROLES)[number];

function tempPassword(): string {
  // Readable temp password, e.g. "Bone-7gk2qd".
  return `Bone-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!me || (me.role !== 'admin' && me.role !== 'master_admin')) {
    return NextResponse.json({ ok: false, error: 'Admins only.' }, { status: 403 });
  }

  let body: { email?: string; full_name?: string; role?: string; phone?: string; hauler_id?: string; invite?: boolean };
  try { body = await req.json(); } catch { body = {}; }

  const email = (body.email || '').trim().toLowerCase();
  const full_name = (body.full_name || '').trim();
  const phone = (body.phone || '').trim();
  const role: NewRole = ROLES.includes(body.role as NewRole) ? (body.role as NewRole) : 'driver';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid email is required.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Invite by email: they get a link and set their own password, so nothing
  // is read out over the phone. If the invite can't be sent (mail not set
  // up, rate limit), fall back to a temporary password so nobody is stuck.
  const wantInvite = body.invite !== false;
  let userId: string | null = null;
  let password: string | null = null;
  let invited = false;
  if (wantInvite) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL_FALLBACK;
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: full_name ? { full_name } : undefined,
      redirectTo: `${siteUrl}/reset-password`,
    });
    if (!invErr && inv?.user) { userId = inv.user.id; invited = true; }
    else if (/already.*registered|exists|been registered/i.test(invErr?.message || '')) {
      return NextResponse.json({ ok: false, error: 'That email already has an account.' }, { status: 400 });
    }
  }
  if (!userId) {
    password = tempPassword();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // they can sign in immediately
      user_metadata: full_name ? { full_name } : undefined,
    });
    if (error || !created?.user) {
      const msg = /already.*registered|exists/i.test(error?.message || '')
        ? 'That email already has an account.'
        : (error?.message || 'Could not create the user.');
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    userId = created.user.id;
  }

  // The handle_new_user trigger created the profile (default driver). Apply the
  // chosen role + details, and keep the force-password-change flag on.
  const { error: upErr } = await admin
    .from('profiles')
    .update({
      role,
      full_name: full_name || null,
      phone: phone || null,
      // Only a hauler login carries a company, and it is what scopes them to
      // their own fleet and loads — a hauler without one sees nothing.
      hauler_id: role === 'hauler' ? (body.hauler_id || null) : null,
      // An invited user sets their own password from the link.
      must_change_password: !invited,
    })
    .eq('id', userId);
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email, password, role, invited });
}
