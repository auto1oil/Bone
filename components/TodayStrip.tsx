'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

// The office's day in one line: what is waiting on them, what is waiting on
// lessors, and what failed quietly. Each count is a link to the place it is
// dealt with. Counts come straight from the tables the office can already
// read; nothing here is a new permission.

type Counts = { toAudit: number; sentBack: number; notInvoiced: number; factorFailed: number; offered: number; declined: number };

export default function TodayStrip() {
  const [c, setC] = useState<Counts | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const count = async (table: string, build: (q: any) => any) => {
        const { count: n } = await build(supabase.from(table).select('id', { count: 'exact', head: true }));
        return n || 0;
      };
      const [toAudit, sentBack, notInvoiced, factorFailed, offered, declined] = await Promise.all([
        count('work_orders', (q) => q.eq('status', 'submitted')),
        count('work_orders', (q) => q.eq('status', 'rejected')),
        count('work_orders', (q) => q.in('status', ['office_approved', 'funds_approved']).is('qb_invoice_id', null)),
        count('work_orders', (q) => q.eq('payment_method', 'factor').is('factor_sent_at', null).not('factor_error', 'is', null)),
        count('hauler_loads', (q) => q.eq('status', 'offered')),
        count('hauler_loads', (q) => q.eq('status', 'declined').gte('updated_at', new Date(Date.now() - 2 * 86400e3).toISOString())),
      ]);
      if (!cancelled) setC({ toAudit, sentBack, notInvoiced, factorFailed, offered, declined });
    })();
    return () => { cancelled = true; };
  }, []);

  if (!c) return null;

  const pill = (n: number, label: string, href: string, tone: 'red' | 'amber' | 'blue' | 'gray') => {
    const tones = {
      red: 'bg-red-50 border-red-200 text-red-800',
      amber: 'bg-amber-50 border-amber-200 text-amber-900',
      blue: 'bg-blue-50 border-blue-200 text-blue-900',
      gray: 'bg-gray-50 border-gray-200 text-gray-600',
    };
    return (
      <Link key={label} href={href}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm ${n > 0 ? tones[tone] : tones.gray} hover:shadow-sm`}>
        <strong className="tabular-nums">{n}</strong> {label}
      </Link>
    );
  };

  return (
    <div className="flex gap-2 flex-wrap mb-4">
      {pill(c.toAudit, c.toAudit === 1 ? 'ticket to audit' : 'tickets to audit', '/work-orders/approve', 'amber')}
      {pill(c.notInvoiced, 'approved, not invoiced', '/work-orders?status=office_approved', 'red')}
      {c.factorFailed > 0 && pill(c.factorFailed, 'not sent to funding', '/work-orders?status=office_approved', 'red')}
      {pill(c.offered, c.offered === 1 ? 'load waiting on a lessor' : 'loads waiting on lessors', '/haulers', 'blue')}
      {c.declined > 0 && pill(c.declined, 'declined by lessors (2 days)', '/haulers', 'red')}
      {c.sentBack > 0 && pill(c.sentBack, 'sent back, with the crew', '/work-orders?status=rejected', 'gray')}
    </div>
  );
}
