'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// One Glovebox's fleet program, framed. Trips, IFTA miles, fuel, receipts,
// maintenance, registrations, repairs, documents — all of it lives over
// there; this tab just gives drivers one app to open. The frame fills the
// screen under the nav; a spinner shows until the panel says it's ready.

export default function FleetPage() {
  const [state, setState] = useState<{ url: string | null; isAdmin: boolean } | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fleet/embed', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (cancelled) return; if (j.ok) setState({ url: j.url, isAdmin: !!j.isAdmin }); else setError(j.error || 'Could not open the fleet program.'); })
      .catch(() => { if (!cancelled) setError('Network error — try again.'); });
    const onMessage = (e: MessageEvent) => {
      if (e.origin === 'https://oneglovebox.com' && e.data && e.data.type === 'ogb:ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    // If the panel never says ready (older build, blocked message), stop
    // covering it after a few seconds anyway.
    const fallback = setTimeout(() => setReady(true), 8000);
    return () => { cancelled = true; window.removeEventListener('message', onMessage); clearTimeout(fallback); };
  }, []);

  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!state) return <p className="p-4 text-sm text-gray-500">Loading…</p>;

  if (!state.url) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <h1 className="text-xl font-semibold mb-2">Fleet program not connected yet</h1>
        {state.isAdmin ? (
          <p className="text-sm text-gray-600">
            Paste Bone&apos;s One Glovebox fleet ID under{' '}
            <Link href="/work-orders/setup" className="text-brand-700 font-medium hover:underline">Tickets → Setup</Link>
            {' '}and this tab opens the fleet program for every driver. The ID is in One Glovebox under Settings → Admin → All users, on the owner&apos;s row.
          </p>
        ) : (
          <p className="text-sm text-gray-600">Ask an admin to connect it under Setup. Once it&apos;s on, trips, fuel, receipts and maintenance all live here.</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-[calc(100vh-7.5rem)]">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-sm text-gray-500">
          Opening the fleet program…
        </div>
      )}
      <iframe
        src={state.url}
        title="Fleet program"
        className="absolute inset-0 w-full h-full border-0"
        allow="geolocation; camera; clipboard-write; web-share; fullscreen"
      />
    </div>
  );
}
