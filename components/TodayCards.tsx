'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { WorkOrder } from '@/lib/work-orders';

// A driver's day at a glance: every open ticket of theirs as one card with
// one big button. A ticket the office sent back is a card too, with the
// reason, because fixing it is today's work as much as a new load is.
// Nothing here is a new query — it is the same "mine" list the page below
// shows, cut to what is still open.

const fmtDate = (ymd: string | null) => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400e3);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function TodayCards() {
  const [open, setOpen] = useState<WorkOrder[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/work-orders?mine=1&status=draft,rejected&limit=10', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled) setOpen(json.ok ? (json.work_orders as WorkOrder[]) : []);
      } catch {
        if (!cancelled) setOpen([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!open || open.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
        {open.length === 1 ? 'Your ticket' : 'Your open tickets'}
      </h2>
      <div className="space-y-2">
        {open.map((w) => {
          const sentBack = w.status === 'rejected';
          return (
            <Link
              key={w.id}
              href={`/tickets/${w.id}`}
              className={`block rounded-xl border-2 p-4 bg-white hover:shadow-md transition-shadow ${sentBack ? 'border-red-300' : 'border-brand-700'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {fmtDate(w.job_date)}{w.trucking_company ? ` · ${w.trucking_company}` : ''}
                  </div>
                  <div className="text-lg font-semibold text-gray-900 truncate">
                    {[w.job_number ? `Job ${w.job_number}` : null, w.job_name].filter(Boolean).join(' · ') || 'Haul ticket'}
                  </div>
                  <div className="text-sm text-gray-600 truncate">
                    {[w.job_address, w.unit_number ? `Truck ${w.unit_number}` : null].filter(Boolean).join(' · ')}
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    {sentBack
                      ? <span className="text-red-700">Sent back: {w.rejected_reason || 'see the office note'}</span>
                      : <>{w.loads_count || 0} {w.loads_count === 1 ? 'load' : 'loads'} stamped so far{w.loads_tons ? ` · ${Number(w.loads_tons).toFixed(1)} tons` : ''}</>}
                  </div>
                </div>
                <span className={`shrink-0 px-4 py-2.5 rounded-lg text-sm font-semibold text-white ${sentBack ? 'bg-red-700' : 'bg-brand-700'}`}>
                  {sentBack ? 'Fix it →' : (w.loads_count || 0) > 0 ? 'Continue →' : 'Start →'}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
