'use client';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';

// Add a staff login. Used on the Users screen and in Settings, so the two
// can't drift apart.
//
// The password is generated on the server and shown once, here. It is never
// stored anywhere readable — the new user is made to change it on first
// sign-in — so if this panel is dismissed before the details are passed on,
// the password is gone and the user needs a reset link instead.

type Role =
  | 'driver' | 'office' | 'contractor' | 'funder' | 'hauler'
  | 'admin' | 'mechanic' | 'labor';

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'driver', label: 'Driver / crew', hint: 'Fills out haul tickets' },
  { value: 'office', label: 'Office', hint: 'Orders, audit, invoicing' },
  { value: 'hauler', label: 'Hauler', hint: 'An outside hauling company' },
  { value: 'contractor', label: 'Contractor', hint: 'Signs off their own crews' },
  { value: 'funder', label: 'Funder', hint: 'Approves funds (Auto 1)' },
  { value: 'admin', label: 'Admin', hint: 'Everything, including users' },
  { value: 'mechanic', label: 'Mechanic', hint: 'Time clock and tasks' },
  { value: 'labor', label: 'Labor', hint: 'Time clock and tasks' },
];

type Created = { email: string; password: string | null; role: string; invited?: boolean };

export default function AddUserPanel({
  onAdded,
  startOpen = false,
}: {
  onAdded?: () => void;
  startOpen?: boolean;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(startOpen);
  const [form, setForm] = useState({
    full_name: '', email: '', role: 'driver' as Role, phone: '', hauler_id: '',
  });
  const [haulers, setHaulers] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  // Email an invite link rather than reading out a temporary password.
  const [invite, setInvite] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadHaulers = useCallback(async () => {
    const { data } = await supabase
      .from('haulers').select('id, name').eq('active', true).order('name');
    setHaulers((data as { id: string; name: string }[]) || []);
  }, [supabase]);

  useEffect(() => { if (open) loadHaulers(); }, [open, loadHaulers]);

  async function create() {
    const email = form.email.trim();
    if (!email) { setError('Enter their email — it is how they sign in.'); return; }
    if (form.role === 'hauler' && !form.hauler_id) {
      setError('Pick the hauling company — a hauler login with no company sees nothing.');
      return;
    }
    setBusy(true); setError(''); setCreated(null); setCopied(false);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, email, invite }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setError(json.error || 'Could not create the user.'); return; }
      setCreated({ email: json.email, password: json.password, role: json.role, invited: !!json.invited });
      setForm({ full_name: '', email: '', role: 'driver', phone: '', hauler_id: '' });
      setOpen(false);
      onAdded?.();
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm';
  const lbl = 'text-xs text-gray-600';
  const picked = ROLES.find((r) => r.value === form.role);

  return (
    <div>
      {!startOpen && (
        <button
          onClick={() => { setOpen((v) => !v); setError(''); }}
          className="px-3 py-2 text-sm bg-brand-700 text-white rounded-md hover:bg-brand-900 font-medium"
        >
          {open ? 'Cancel' : '+ Add user'}
        </button>
      )}

      {open && (
        <div className={`bg-white border border-gray-200 rounded-lg p-4 space-y-3 ${startOpen ? '' : 'mt-3'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={lbl}>Name
              <input
                type="text" value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className={input}
              />
            </label>
            <label className={lbl}>Role
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className={input}
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {picked && <span className="block mt-1 text-gray-500">{picked.hint}</span>}
            </label>

            {form.role === 'hauler' && (
              <label className={`${lbl} sm:col-span-2`}>Hauling company
                <select
                  value={form.hauler_id}
                  onChange={(e) => setForm({ ...form, hauler_id: e.target.value })}
                  className={input}
                >
                  <option value="">— Pick a company —</option>
                  {haulers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                {haulers.length === 0 && (
                  <span className="block mt-1 text-gray-500">
                    No hauling companies on file yet — add one under Haulers first.
                  </span>
                )}
              </label>
            )}

            <label className={lbl}>Email
              <input
                type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={input}
              />
            </label>
            <label className={lbl}>Phone (optional)
              <input
                type="tel" value={form.phone} placeholder="+18015551234"
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={input}
              />
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>Email them a link to set their own password <span className="text-gray-500">(untick for a temporary password to read out)</span></span>
          </label>

          <button
            onClick={create}
            disabled={busy || !form.email.trim()}
            className="px-3 py-2 text-sm bg-brand-700 text-white rounded-md hover:bg-brand-900 disabled:opacity-50 font-medium"
          >
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </div>
      )}

      {created && created.invited && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-3 text-sm">
          <p className="font-medium text-emerald-900 mb-1">Invite sent to {created.email} ({created.role})</p>
          <p className="text-emerald-900">They set their own password from the link in the email, then sign in. If it doesn&apos;t arrive, use Reset password on their row for a temporary one.</p>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs text-gray-500 hover:underline">Dismiss</button>
        </div>
      )}
      {created && !created.invited && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-3 text-sm">
          <p className="font-medium text-emerald-900 mb-1">User created ({created.role})</p>
          <p className="text-emerald-900">
            Send them these. They pick their own password on first sign-in.
          </p>
          <div className="mt-2 font-mono text-xs bg-white border border-emerald-200 rounded p-2 space-y-0.5 break-all">
            <div>Email: {created.email}</div>
            <div>Temp password: {created.password}</div>
          </div>
          <p className="mt-2 text-xs text-emerald-800">
            This password is shown once and isn&apos;t stored anywhere. If you
            lose it, they can use &quot;Forgot password&quot; on the sign-in page.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(
                  `Email: ${created.email}\nTemp password: ${created.password}`,
                );
                setCopied(true);
              }}
              className="text-xs text-brand-700 hover:underline"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => setCreated(null)} className="text-xs text-gray-500 hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
