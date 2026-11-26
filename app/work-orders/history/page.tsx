'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import AdminSubNav from '@/components/AdminSubNav';
import { EVENT_KINDS, eventTone, type TicketEvent } from '@/lib/ticket-events';

// History: everything the office has done with tickets, newest first.
// "Which tickets did we approve, which did we send back and why" — the
// answer stays here after the ticket itself has moved on. Lines are written
// by the server when the thing happens; nobody edits them.

const TABS = [
  { key: 'decisions', label: 'Approved & sent back', kinds: ['approved', 'sent_back'] },
  { key: 'approved', label: 'Approved', kinds: ['approved'] },
  { key: 'sent_back', label: 'Sent back', kinds: ['sent_back'] },
  { key: 'invoices', label: 'Invoices', kinds: ['invoiced', 'invoice_failed', 'invoice_voided'] },
  { key: 'all', label: 'Everything', kinds: null },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const PAGE = 200;
const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function TicketHistoryPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<TabKey>('decisions');
  const [rows, setRows] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (key: TabKey, before: string | null) => {
    const kinds = TABS.find((t) => t.key === key)?.kinds ?? null;
    let query = supabase.from('work_order_events').select('*').order('at', { ascending: false }).limit(PAGE);
    if (kinds) query = query.in('kind', kinds as unknown as string[]);
    if (before) query = query.lt('at', before);
    const { data, error: err } = await query;
    if (err) { setError('The history isn’t set up yet. Run the latest SQL from supabase-setup.sql.'); setLoading(false); return; }
    const list = (data as TicketEvent[]) || [];
    setRows((prev) => (before ? [...prev, ...list] : list));
    setMore(list.length === PAGE);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { setLoading(true); setError(''); load(tab, null); }, [tab, load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((e) => [e.ticket_label, e.job, e.actor_name, e.detail, EVENT_KINDS[e.kind]]
      .some((v) => (v || '').toLowerCase().includes(needle)));
  }, [rows, q]);

  // Grouped under the day they happened.
  const groups = useMemo(() => {
    const out: { day: string; items: TicketEvent[] }[] = [];
    for (const e of shown) {
      const d = day(e.at);
      const last = out[out.length - 1];
      if (last && last.day === d) last.items.push(e); else out.push({ day: d, items: [e] });
    }
    return out;
  }, [shown]);

  return (
    <div>
      <AdminSubNav
        tabs={[
          { href: '/work-orders', label: 'All tickets' },
          { href: '/work-orders/approve', label: 'Approve' },
          { href: '/work-orders/history', label: 'History' },
          { href: '/work-orders/setup', label: 'Setup' },
        ]}
        roles={['office', 'admin', 'master_admin']}
      />
      <h1 className="text-2xl font-semibold mb-1">Ticket history</h1>
      <p className="text-sm text-gray-600 mb-3">
        Every ticket the office approved or sent back, who did it, when, and the reason given. Tap a line to open the ticket.
      </p>

      <div className="flex gap-2 flex-wrap mb-3">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-full border ${tab === t.key ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticket #, job, person or reason"
        className="w-full sm:w-96 px-3 py-2 border border-gray-300 rounded-md text-sm mb-3" />

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? <p className="text-sm text-gray-500">Loading…</p> : shown.length === 0 && !error ? (
        <p className="text-sm text-gray-500">
          {q ? 'Nothing matches that search.' : 'Nothing here yet. Lines appear as tickets are approved, sent back and invoiced.'}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.day}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{g.day}</h2>
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
                {g.items.map((e) => {
                  const line = (
                    <div className="flex items-start gap-3 px-3 py-2">
                      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${eventTone(e.kind)}`}>
                        {EVENT_KINDS[e.kind] || e.kind}
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="font-medium text-gray-900">
                          {[e.ticket_label, e.job].filter(Boolean).join(' · ') || 'Ticket'}
                          {!e.work_order_id && <span className="ml-2 text-xs font-normal text-gray-500">(ticket deleted)</span>}
                        </div>
                        {e.detail && <div className="text-gray-700 break-words">{e.detail}</div>}
                        <div className="text-xs text-gray-500">{time(e.at)}{e.actor_name ? ` · ${e.actor_name}` : ''}</div>
                      </div>
                    </div>
                  );
                  return e.work_order_id
                    ? <Link key={e.id} href={`/work-orders/${e.work_order_id}`} className="block hover:bg-gray-50">{line}</Link>
                    : <div key={e.id}>{line}</div>;
                })}
              </div>
            </div>
          ))}
          {more && !q && (
            <button onClick={() => load(tab, rows[rows.length - 1]?.at ?? null)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
              Show older
            </button>
          )}
        </div>
      )}
    </div>
  );
}
