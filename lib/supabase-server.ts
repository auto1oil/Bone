import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            // Thirty-day sign-ins (the browser client and the middleware say
            // the same, and all three must agree).
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, maxAge: 60 * 60 * 24 * 30 })
            );
          } catch { /* server component, ignore */ }
        },
      },
    }
  );
}
