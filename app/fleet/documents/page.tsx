'use client';
import { useCallback, useEffect, useState } from 'react';
import FleetNav from '@/components/FleetNav';
import FleetUpload from '@/components/FleetUpload';
import { useFleet, input, label, btn, fmtDate } from '@/lib/use-fleet';
import { FLEET_DOC_KINDS, dueTone, type FleetDocument } from '@/lib/fleet';

// The papers: registration, insurance, inspections, titles, permits, IFTA
// and IRP, per truck or for the company. Anything with an expiry is sorted
// by it, red when past, amber inside thirty days.

export default function FleetDocumentsPage() {
  const { supabase, meId, role, canManage, isAdmin, vehicles, loading, unitOf } = useFleet();
  const [rows, setRows] = useState<FleetDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const blank = { vehicle_id: '', kind: 'Registration', file_name: '', expires_on: '', notes: '' };
  const [draft, setDraft] = useState(blank);
  const [file, setFile] = useState<string | null>(null);
  const canAdd = canManage || role === 'mechanic';

  const load = useCallback(async () => {
    const { data } = await supabase.from('fleet_documents').select('*').order('expires_on', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    setRows((data as FleetDocument[]) || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!file) { setError('Add the file first.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.from('fleet_documents').insert({
      vehicle_id: draft.vehicle_id || null, kind: draft.kind, file_name: draft.file_name.trim() || null, file_path: file,
      expires_on: draft.expires_on || null, notes: draft.notes.trim() || null, uploaded_by: meId,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setDraft(blank); setFile(null); setAdding(false); load();
  }
  async function remove(d: FleetDocument) {
    if (!confirm('Delete this document?')) return;
    const { error: err } = await supabase.from('fleet_documents').delete().eq('id', d.id);
    if (err) { setError(err.message); return; }
    load();
  }

  const set = (k: keyof typeof blank, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const tone = (d: string | null) => { const t = dueTone(d); return t === 'past' ? 'text-red-700 font-semibold' : t === 'soon' ? 'text-amber-800 font-semibold' : 'text-gray-600'; };
  const expiring = rows.filter((d) => ['past', 'soon'].includes(dueTone(d.expires_on) || ''));

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 w-full space-y-4">
      <FleetNav />
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Documents</h1>
        {canAdd && <button onClick={() => setAdding((a) => !a)} className={btn}>{adding ? 'Cancel' : '+ Add document'}</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {expiring.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900">
          <strong>{expiring.length} {expiring.length === 1 ? 'document is' : 'documents are'} expired or expiring within 30 days.</strong> They&apos;re at the top of the list.
        </div>
      )}

      {adding && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label><span className={label}>Kind</span>
                  <select value={draft.kind} onChange={(e) => set('kind', e.target.value)} className={input}>{FLEET_DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
                </label>
                <label><span className={label}>Truck</span>
                  <select value={draft.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} className={input}>
                    <option value="">Whole company</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.unit_number}{v.name ? ` · ${v.name}` : ''}</option>)}
                  </select>
                </label>
                <label><span className={label}>Expires</span><input type="date" value={draft.expires_on} onChange={(e) => set('expires_on', e.target.value)} className={input} /></label>
                <label><span className={label}>Name</span><input value={draft.file_name} onChange={(e) => set('file_name', e.target.value)} placeholder="2026 registration" className={input} /></label>
                <label className="col-span-2 sm:col-span-3"><span className={label}>Notes</span><input value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={input} /></label>
                <div><FleetUpload label="File" path={file} onChange={setFile} folder="documents" /></div>
              </div>
              <button onClick={save} disabled={busy} className={`${btn} mt-3`}>{busy ? 'Saving…' : 'Save'}</button>
            </>
          )}
        </div>
      )}

      {rows.length === 0 ? <p className="text-sm text-gray-400">No documents yet.</p> : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
          {rows.map((d) => (
            <div key={d.id} className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-medium">{d.kind}{d.file_name ? ` · ${d.file_name}` : ''} · {d.vehicle_id ? `Unit ${unitOf(d.vehicle_id)}` : 'Company'}</div>
                <div className={`text-xs ${tone(d.expires_on)}`}>{d.expires_on ? `${dueTone(d.expires_on) === 'past' ? 'Expired' : 'Expires'} ${fmtDate(d.expires_on)}` : 'No expiry'}{d.notes ? ` · ${d.notes}` : ''}</div>
              </div>
              <div className="flex items-center gap-3">
                <FleetUpload label="" path={d.file_path} readOnly />
                {isAdmin && <button onClick={() => remove(d)} className="text-xs text-red-600 hover:underline">Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
