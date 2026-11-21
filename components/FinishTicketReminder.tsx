'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ticketLabel, type WorkOrder } from '@/lib/work-orders';

// The full-screen "finish your haul ticket" reminder. When a driver opens
// the app in the evening with a started ticket still open — or any time with
// one left over from an earlier day — this covers the screen until they open
// the ticket or put it off for an hour. It is the in-app half of the hourly
// push; a ticket left open is a day that can't be billed.

const SNOOZE_KEY = 'bone-finish-reminder-snooze';

function localDay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function FinishTicketReminder() {
  const pathname = usePathname();
  const [ticket, setTicket] = useState<WorkOrder | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
        if (until > Date.now()) return;
      } catch { /* no storage: just show it */ }
      try {
        const res = await fetch('/api/work-orders?mine=1&status=draft,rejected&limit=20', { cache: 'no-store' });
        const json = await res.json();
        if (!json.ok || cancelled) return;
        const today = localDay();
        const hour = new Date().getHours();
        const due = (json.work_orders as WorkOrder[])
          .filter((w) => (Number(w.loads_count || 0) > 0 || w.paper) && w.job_date)
          .filter((w) => w.job_date! < today || (w.job_date === today && hour >= 18))
          .sort((a, b) => (a.job_date! < b.job_date! ? -1 : 1))[0];
        setTicket(due || null);
      } catch { /* offline: nothing to show */ }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  // On the ticket itself there is nothing to remind them of.
  if (!ticket || pathname === `/tickets/${ticket.id}`) return null;

  const old = ticket.job_date! < localDay();
  function later() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 60 * 60_000)); } catch { /* fine */ }
    setTicket(null);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-brand-900/95 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent-400">{old ? 'Still open from an earlier day' : 'Before you call it a night'}</div>
        <h2 className="text-2xl font-bold mt-1">Finish your haul ticket</h2>
        <p className="text-sm text-gray-700 mt-2">
          <strong>{ticketLabel(ticket)}</strong>
          {ticket.job_name || ticket.job_number ? ` · ${ticket.job_name || `Job ${ticket.job_number}`}` : ''}
          {' · '}{ticket.job_date}
        </p>
        <p className="text-sm text-gray-600 mt-1">
          {ticket.paper ? 'Paper copy' : `${ticket.loads_count} ${ticket.loads_count === 1 ? 'load' : 'loads'} stamped`}. It can&apos;t be billed until you tap Finish day.
        </p>
        <Link href={`/tickets/${ticket.id}`} onClick={() => setTicket(null)}
          className="block mt-4 px-5 py-3 rounded-lg bg-brand-700 text-white font-semibold hover:bg-brand-900">
          Open the ticket
        </Link>
        <button type="button" onClick={later} className="mt-3 text-sm text-gray-500 underline decoration-dotted underline-offset-2">
          Remind me in an hour
        </button>
      </div>
    </div>
  );
}
