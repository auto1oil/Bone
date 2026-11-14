'use client';
import { createBrowserClient } from '@supabase/ssr';

// Session-only auth: no Max-Age on the auth cookies, so they die with the
// browser/app and every fresh open is a fresh sign-in. The middleware and
// server client strip the lifetime the same way — all three writers must
// agree or a refresh would quietly make the login persistent again.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // A sign-in lasts thirty days on the device, so a driver isn't typing a
    // password at the pit every morning. Signing out still ends it at once.
    { cookieOptions: { maxAge: 60 * 60 * 24 * 30 } }
  );
}
