'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import OrderForm from '@/components/OrderForm';
import { createClient } from '@/lib/supabase-browser';
import type { JobOrder } from '@/lib/job-orders';

// A new order, blank — or, with ?from=<order id>, a copy of an existing one
// with everything but the dates filled in. Most jobs repeat.

export default function NewOrderPage() {
  const [template, setTemplate] = useState<JobOrder | null | undefined>(undefined);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from');
    if (!from) { setTemplate(null); return; }
    createClient().from('job_orders').select('*').eq('id', from).maybeSingle()
      .then(({ data }) => setTemplate((data as JobOrder | null) || null));
  }, []);

  if (template === undefined) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div>
      <Link href="/work-orders/orders" className="text-sm text-brand-700 hover:underline">← Orders</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{template ? 'Copy order' : 'Create order'}</h1>
      <p className="text-sm text-gray-600 mb-4">
        {template
          ? `Copied from #${template.order_number}${template.job_name ? ` · ${template.job_name}` : ''}. Set the dates, check the rest, and create it.`
          : 'An order is a specific job. Tickets and hauler dispatches all point at one, so this is what an invoice gets checked against.'}
      </p>
      <OrderForm order={null} template={template} />
    </div>
  );
}
