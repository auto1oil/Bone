'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { invoiceLabel } from '@/lib/invoice-pdf';
import type { TicketInvoice } from '@/lib/invoices';

// Invoices: every invoice Bone has sent from the audit, newest first. Open
// the PDF, send it again (or for the first time, if the first send didn't
// go), and — admins only — void one. A voided number is never reused; its
// ticket goes back to approved so it can be fixed and invoiced again.

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'unsent', label: 'Not emailed' },
  { key: 'void', label: 'Void' },
] as const;

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export default function InvoicesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<TicketInvoice[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // The row whose "send to" box is open, and what's typed in it.
  const [sending, setSending] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState('');

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('ticket_invoices').select('*').order('invoice_no', { ascending: false }).limit(500);
    const list = (data as TicketInvoice[]) || [];
    setRows(list);
    const bizIds = [...new Set(list.map((r) => r.business_id).filter(Boolean))] as string[];
    if (bizIds.length) {
      const { data: biz } = await supabase.from('businesses').select('id, email').in('id', bizIds);
      setEmails(Object.fromEntries(((biz as { id: string; email: string | null }[]) || []).map((b) => [b.id, b.email || ''])));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setIsAdmin(me?.role === 'admin' || me?.role === 'master_admin');
    })();
  }, [refresh, supabase]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === 'void' && r.status !== 'void') return false;
      if (tab === 'unsent' && (r.status === 'void' || r.emailed_at)) return false;
      if (!needle) return true;
      return [invoiceLabel(r.invoice_no), r.customer_name, r.job_name, r.job_number, r.ticket_label]
        .some((v) => (v || '').toLowerCase().includes(needle));
    });
  }, [rows, tab, q]);

  const live = rows.filter((r) => r.status !== 'void');
  const unsent = live.filter((r) => !r.emailed_at).length;

  // The tab opens before the await — Safari blocks a window.open after one.
  async function openPdf(r: TicketInvoice) {
    if (!r.pdf_path) { setError(`${invoiceLabel(r.invoice_no)} has no PDF yet. Send it and one is built.`); return; }
    const tab2 = window.open('about:blank', '_blank');
    const { data } = await supabase.storage.from('work-tickets').createSignedUrl(r.pdf_path, 300);
    if (data?.signedUrl) { if (tab2) tab2.location.href = data.signedUrl; else window.location.href = data.signedUrl; }
    else { tab2?.close(); setError('Could not open the PDF.'); }
  }

  async function send(r: TicketInvoice) {
    setBusy(r.id); setError(''); setMsg('');
    try {
      const onFile = (r.business_id && emails[r.business_id]) || '';
      const res = await fetch(`/api/invoices/${r.id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // A new address typed here becomes the customer's billing email.
        body: JSON.stringify({ to: sendTo.trim(), remember: sendTo.trim() !== onFile }),
      });
      const json = await res.json();
      if (!json.ok) setError(`${invoiceLabel(r.invoice_no)}: ${json.error || 'not sent'}`);
      else { setMsg(`${invoiceLabel(r.invoice_no)} emailed to ${json.invoice.emailed_to}.`); setSending(null); }
    } catch {
      setError('Network error — try again.');
    }
    setBusy('');
    refresh();
  }

  async function voidIt(r: TicketInvoice) {
    const reason = window.prompt(`Void ${invoiceLabel(r.invoice_no)}? Its ticket goes back to approved so it can be fixed and invoiced again under a new number.\n\nWhy is it being voided?`)?.trim();
    if (!reason) return;
    setBusy(r.id); setError(''); setMsg('');
    try {
      const res = await fetch(`/api/invoices/${r.id}/void`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!json.ok) setError(json.error || 'Could not void it.');
      else setMsg(`${invoiceLabel(r.invoice_no)} voided.`);
    } catch {
      setError('Network error — try again.');
    }
    setBusy('');
    refresh();
  }

  const input = 'px-2.5 py-1.5 border border-gray-300 rounded-md text-sm';

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <span className="text-sm text-gray-600">
          {live.length} sent · <strong>{money(live.reduce((n, r) => n + Number(r.amount || 0), 0))}</strong>
          {unsent > 0 && <span className="text-amber-700"> · {unsent} not emailed</span>}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-md border ${tab === t.key ? 'bg-brand-700 text-white border-brand-700 font-medium' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
            {t.label}{t.key === 'unsent' && unsent > 0 ? ` (${unsent})` : ''}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice #, customer, job, ticket" className={`${input} flex-1 min-w-[12rem]`} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : shown.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-4">
          {rows.length === 0
            ? 'No invoices yet. They appear here when you tap Send Invoice in the audit on the Tickets tab.'
            : 'Nothing under this filter.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
          {shown.map((r) => {
            const isVoid = r.status === 'void';
            const onFile = (r.business_id && emails[r.business_id]) || '';
            return (
              <div key={r.id} className={`bg-white border rounded-lg px-4 py-3 ${isVoid ? 'border-dashed border-gray-300 opacity-70' : r.emailed_at ? 'border-gray-200' : 'border-amber-300'}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {invoiceLabel(r.invoice_no)}
                      <span className="font-normal text-gray-500"> · {r.issued_on}</span>
                      {isVoid && <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600">Void</span>}
                    </div>
                    <div className="text-sm text-gray-800 truncate">{r.customer_name || 'No customer'}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {[r.job_name || (r.job_number ? `Job ${r.job_number}` : null), r.ticket_label, r.job_date ? `hauled ${r.job_date}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-lg font-semibold tabular-nums ${isVoid ? 'line-through' : ''}`}>{money(r.amount)}</div>
                    <div className="text-[11px] text-gray-500 tabular-nums">{Number(r.quantity).toFixed(2)} {r.unit} × {money(r.rate)}</div>
                  </div>
                </div>

                <div className="text-xs mt-1.5">
                  {isVoid
                    ? <span className="text-gray-600">Voided {when(r.voided_at)}: {r.void_reason}</span>
                    : r.emailed_at
                      ? <span className="text-emerald-700">Emailed to {r.emailed_to} · {when(r.emailed_at)}</span>
                      : <span className="text-amber-800">Not emailed. {r.email_error || ''}</span>}
                  {!isVoid && r.due_on && <span className="text-gray-500"> · due {r.due_on}</span>}
                </div>

                <div className="flex gap-3 flex-wrap mt-2 text-sm">
                  <button onClick={() => openPdf(r)} className="text-brand-700 hover:underline">Open PDF</button>
                  {!isVoid && (
                    <button onClick={() => { setSending(sending === r.id ? null : r.id); setSendTo(r.emailed_to || onFile); }} className="text-brand-700 hover:underline">
                      {r.emailed_at ? 'Send again' : 'Send'}
                    </button>
                  )}
                  {r.work_order_id && <Link href={`/work-orders/${r.work_order_id}`} className="text-brand-700 hover:underline">Open ticket</Link>}
                  {isAdmin && !isVoid && (
                    <button onClick={() => voidIt(r)} disabled={busy === r.id} className="text-red-600 hover:underline disabled:opacity-50 ml-auto">Void</button>
                  )}
                </div>

                {sending === r.id && (
                  <div className="flex gap-2 mt-2">
                    <input type="email" inputMode="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)}
                      placeholder="billing@customer.com" className={`${input} flex-1 min-w-0`} />
                    <button onClick={() => send(r)} disabled={busy === r.id || !sendTo.trim()}
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-700 text-white font-medium disabled:opacity-50">
                      {busy === r.id ? 'Sending…' : 'Email it'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
