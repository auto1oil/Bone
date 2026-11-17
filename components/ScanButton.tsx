'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { maybeCompressImage } from '@/lib/image-compress';
import type { ScanKind } from '@/lib/fleet-scan';

// Snap a paper, read it, fill the form. The photo goes into fleet-docs first
// (so it is kept as the receipt or document either way), then the server
// reads it and hands back fields. The caller merges those into its draft and
// gets the storage path so the same photo can be attached to the record.

export default function ScanButton({
  kind, folder, onResult, label, className = '', bucket = 'fleet-docs', small = false, disabled = false,
}: {
  kind: ScanKind;
  folder: string;
  onResult: (fields: Record<string, unknown>, path: string) => void;
  label?: string;
  className?: string;
  // Fleet papers live in fleet-docs; a load's BOL goes with the ticket's
  // other photos in work-tickets, under the driver's own folder.
  bucket?: 'fleet-docs' | 'work-tickets';
  small?: boolean;
  disabled?: boolean;
}) {
  const supabase = createClient();
  const [stage, setStage] = useState<'idle' | 'uploading' | 'reading'>('idle');
  const [error, setError] = useState('');

  async function scan(file: File) {
    setError(''); setStage('uploading');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const body = file.type.startsWith('image/') ? await maybeCompressImage(file) : file;
      const ext = (body.name.split('.').pop() || 'jpg').toLowerCase();
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      // work-tickets' read policy keys off the first folder being the
      // uploader's id; fleet-docs is read by all staff, so the folder leads.
      const key = bucket === 'work-tickets'
        ? `${user?.id || 'anon'}/${folder}/${stamp}`
        : `${folder}/${user?.id || 'anon'}/${stamp}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(key, body, { upsert: false, contentType: body.type || undefined });
      if (upErr) { setError(upErr.message); return; }
      setStage('reading');
      const res = await fetch('/api/fleet/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: key, kind, bucket }) });
      const json = await res.json().catch(() => ({ ok: false, error: 'Scan failed.' }));
      if (!json.ok) { setError(json.error || 'Scan failed.'); onResult({}, key); return; }
      onResult(json.fields || {}, key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed.');
    } finally {
      setStage('idle');
    }
  }

  const busy = stage !== 'idle';
  return (
    <div className={className}>
      <label className={`inline-flex items-center justify-center gap-1.5 rounded-md border cursor-pointer font-medium ${
        small ? 'w-full px-2 py-1.5 text-sm border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'px-3 py-1.5 text-sm border-brand-700 text-brand-700 hover:bg-brand-50'
      } ${busy || disabled ? 'opacity-60 pointer-events-none' : ''}`}>
        <span aria-hidden>📷</span>
        {stage === 'uploading' ? 'Uploading…' : stage === 'reading' ? 'Reading…' : (label || 'Scan')}
        <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" disabled={busy || disabled}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) scan(f); e.target.value = ''; }} />
      </label>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
