'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { maybeCompressImage } from '@/lib/image-compress';
import { fleetFileUrl } from '@/lib/use-fleet';

// A receipt or a paper for the fleet: photo from the camera (compressed
// first) or a PDF, into the private fleet-docs bucket. Shows a link to what
// is there; Replace puts a new file in its place.

export default function FleetUpload({
  label, path, onChange, readOnly = false, folder = 'misc',
}: {
  label: string;
  path: string | null;
  onChange?: (path: string | null) => void;
  readOnly?: boolean;
  folder?: string;
}) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    fleetFileUrl(path).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [path]);

  async function upload(file: File) {
    setBusy(true); setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const body = file.type.startsWith('image/') ? await maybeCompressImage(file) : file;
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      const key = `${folder}/${user?.id || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('fleet-docs').upload(key, body, { upsert: false, contentType: file.type || undefined });
      if (upErr) { setError(upErr.message); return; }
      onChange?.(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <div className="flex items-center gap-3 flex-wrap">
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-700 underline decoration-dotted underline-offset-2">
            Open
          </a>
        )}
        {!readOnly && (
          <label className={`px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 cursor-pointer ${busy ? 'opacity-50' : ''}`}>
            {busy ? 'Uploading…' : path ? 'Replace' : 'Add photo or PDF'}
            <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          </label>
        )}
        {!readOnly && path && (
          <button type="button" onClick={() => onChange?.(null)} className="text-xs text-gray-500 hover:underline">Remove</button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
