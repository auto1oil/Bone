'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { EVENT_KINDS, eventTone, type TicketEvent } from '@/lib/ticket-events';

// One ticket's history, oldest first: sent to the driver, finished, sent
// back (with the reason), approved, invoiced. `stamp` changes when the
// ticket does, so the card re-reads after an approval on the same screen.

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function TicketHistory({ workOrderId, stamp }: { workOrderId: string; stamp?: string | null }) {
  const [rows, setRows] = useState<TicketEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('work_order_events').select('*')
        .eq('work_order_id', workOrderId).order('at', { ascending: true }).limit(200);
      if (live) setRows((data as TicketEvent[]) || []);
    })();
    return () => { live = false; };
  }, [workOrderId, stamp]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-3">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">History</h2>
      <ol className="space-y-1.5">
        {rows.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-xs">
            <span className={`shrink-0 px-2 py-0.5 rounded-full border font-semibold ${eventTone(e.kind)}`}>
              {EVENT_KINDS[e.kind] || e.kind}
            </span>
            <span className="text-gray-600">
              {when(e.at)}{e.actor_name ? ` · ${e.actor_name}` : ''}
              {e.detail ? <span className="block text-gray-800">{e.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
