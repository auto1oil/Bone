'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { ticketAmount, billableQuantity, billableUnit, type WorkOrder } from '@/lib/work-orders';

// Where the company's money stands, ticket by ticket, without opening each
// one: what is still with the office, what Bone owes on its pay run, what
// went to Auto 1 Funding, and what came back to fix. The amounts are the
// hauler's own rate on their own quantity — the same number the office
// approves — and the customer's side never appears here.

type Bucket = { key: string; title: string; note: string; rows: WorkOrder[]; total: number };

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (ymd: string | null) => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function HaulerPayPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<WorkOrder[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      // RLS scopes this to the company's own tickets.
      const since = new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10);
      const { data, error: err } = await supabase
        .from('work_orders').select('*')
        .in('status', ['submitted', 'office_approved', 'funds_approved', 'invoiced', 'rejected'])
        .gte('job_date', since)
        .order('job_date', { ascending: false });
      if (err) { setError(err.message); setRows([]); return; }
      setRows((data as WorkOrder[]) || []);
    })();
  }, [supabase]);

  if (rows === null) return <p className="text-sm text-gray-500">Loading…</p>;

  const approved = rows.filter((w) => ['office_approved', 'funds_approved', 'invoiced'].includes(w.status));
  const sum = (list: WorkOrder[]) => list.reduce((n, w) => n + ticketAmount(w), 0);
  const buckets: Bucket[] = [
    { key: 'waiting', title: 'Waiting on the office', note: 'Completed by your drivers, not yet audited. Amounts are what the tickets say so far.',
      rows: rows.filter((w) => w.status === 'submitted') },
    { key: 'standard', title: "Approved — on Bone's pay run", note: 'Audited and approved by the office. Paid by Bone on the normal pay run.',
      rows: approved.filter((w) => w.payment_method !== 'factor') },
    { key: 'factor', title: 'Approved — Factor Payment', note: 'Handed to Auto 1 Funding, which pays these. A ticket that didn\'t reach them yet shows why.',
      rows: approved.filter((w) => w.payment_method === 'factor') },
    { key: 'back', title: 'Sent back to fix', note: 'The office needs a change before these can be approved. Open each one for the reason.',
      rows: rows.filter((w) => w.status === 'rejected') },
  ].map((b) => ({ ...b, total: sum(b.rows) }));

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Pay</h1>
        <p className="text-sm text-gray-600">Your tickets from the last 120 days and where each one stands.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {buckets.map((b) => (
          <a key={b.key} href={`#${b.key}`} className="bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-brand-500">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 truncate">{b.title}</div>
            <div className="text-lg font-semibold tabular-nums">{fmtMoney(b.total)}</div>
            <div className="text-xs text-gray-500">{b.rows.length} {b.rows.length === 1 ? 'ticket' : 'tickets'}</div>
          </a>
        ))}
      </div>

      {buckets.map((b) => (
        <section key={b.key} id={b.key}>
          <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{b.title}</h2>
            <span className="text-sm font-semibold tabular-nums">{fmtMoney(b.total)}</span>
          </div>
          <p className="text-xs text-gray-500 mb-2">{b.note}</p>
          {b.rows.length === 0 ? (
            <p className="text-sm text-gray-400 bg-white border border-dashed border-gray-200 rounded-lg px-3 py-2">Nothing here.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
              {b.rows.map((w) => {
                const factorNote = b.key === 'factor'
                  ? (w.factor_sent_at ? 'with Auto 1 Funding' : w.factor_error ? `not sent yet — ${w.factor_error}` : 'going to Auto 1 Funding')
                  : null;
                return (
                  <Link key={w.id} href={`/tickets/${w.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {fmtDate(w.job_date)} · {[w.job_number ? `Job ${w.job_number}` : null, w.job_name].filter(Boolean).join(' · ') || 'Ticket'}
                        {w.ticket_number ? ` · #${w.ticket_number}` : ''}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {[w.driver_name, w.unit_number ? `Truck ${w.unit_number}` : null,
                          `${billableQuantity(w).toFixed(2)} ${billableUnit(w)} @ $${Number(w.rate || 0).toFixed(2)}`,
                          w.status === 'invoiced' ? 'invoiced' : null, factorNote].filter(Boolean).join(' · ')}
                        {b.key === 'back' && w.rejected_reason ? ` · ${w.rejected_reason}` : ''}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums shrink-0">{fmtMoney(ticketAmount(w))}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
