'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import {
  LOAD_STAMPS, totalLoadTons, countLoads, stampSpan,
  type WorkOrderLoad, type LoadStampKey,
} from '@/lib/work-orders';
import { MAX_LOADS } from '@/lib/truck-types';
import { pingTicketProgress } from '@/lib/progress-ping';
import ScanButton from '@/components/ScanButton';
import { sv, sn, type BolScan } from '@/lib/fleet-scan';

// The 28 load lines off the paper haul ticket (two columns of fourteen on the
// pad): per load, a ticket number, the four in/out stamps, what it weighed, and
// what it carried.
//
// A stamp is one tap. The time is taken from the phone the instant the button
// is pressed and shown straight away — the GPS fix is chased afterwards with a
// short timeout and attached if it arrives. That ordering matters in the field:
// a driver in a pit with no sky should still get an accurate time, and waiting
// on a fix before showing anything makes the button feel broken.
//
// The paper form is a 7-column grid, which is unusable on a phone, so each
// load is a card instead. Same information, one thumb.

export type LoadTotals = { loads: number; tons: number; firstIn: string | null; lastOut: string | null };

type Props = {
  workOrderId: string;
  locked?: boolean;
  onTotalsChange?: (totals: LoadTotals) => void;
  // The ticket's material, shown as the placeholder on each load so the
  // driver only types it when a load carried something else.
  defaultMaterial?: string;
};

const GPS_TIMEOUT_MS = 8000;

type Fix = { lat: number; lng: number; accuracy: number } | null;

// Best-effort location. Never rejects: a refused permission, a device with no
// GPS, or a slow fix all resolve to null so the stamp still saves.
function getFix(): Promise<Fix> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    let settled = false;
    const done = (v: Fix) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done(null), GPS_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      () => { clearTimeout(timer); done(null); },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 30_000 },
    );
  });
}

const clockOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

// Where the floating stamp button sits, remembered per device. It's a
// per-driver convenience — a lost value just puts the button back in the
// corner.
const FAB_POS_KEY = 'bone-stamp-fab-pos';

// Stamps that couldn't be sent — a pit with no signal — wait on the phone
// and go when the signal returns. The time and the fix were taken at the
// tap, so nothing about the stamp changes by arriving late.
const QUEUE_KEY = 'bone-stamp-queue';
type QueuedStamp = { workOrderId: string; loadNo: number; key: LoadStampKey; at: string; fix: Fix };
function readQueue(): QueuedStamp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedStamp[]; } catch { return []; }
}
function writeQueue(q: QueuedStamp[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage full or blocked: the stamp still shows until reload */ }
}
// A failed write that is the network's fault, not the data's.
function looksOffline(message: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /fetch|network|load failed|timed? ?out|connection|socket/i.test(message);
}

export default function LoadLines({ workOrderId, locked = false, onTotalsChange, defaultMaterial = '' }: Props) {
  const supabase = createClient();
  const [loads, setLoads] = useState<WorkOrderLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Times shown before the row comes back from the database, so a tap reads as
  // instant even on a bad signal. Keyed "loadNo:stampKey".
  const [pending, setPending] = useState<Record<string, string>>({});
  // Stamps waiting on the phone for a signal, keyed the same way.
  const [queued, setQueued] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('work_order_loads')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('load_no');
    setLoads((data as WorkOrderLoad[]) || []);
    setLoading(false);
  }, [supabase, workOrderId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    onTotalsChange?.({ loads: countLoads(loads), tons: totalLoadTons(loads), ...stampSpan(loads) });
  }, [loads, onTotalsChange]);

  // Write one stamp. Returns the error message when it didn't land.
  const writeStamp = useCallback(async (loadNo: number, key: LoadStampKey, at: string, fix: Fix): Promise<string | null> => {
    const patch: Record<string, unknown> = {
      [`${key}_at`]: at,
      [`${key}_lat`]: fix?.lat ?? null,
      [`${key}_lng`]: fix?.lng ?? null,
      [`${key}_accuracy`]: fix?.accuracy ?? null,
    };
    // Look the row up fresh: a queued stamp may be for a load another
    // stamp created in the meantime.
    const { data: rows, error: readErr } = await supabase
      .from('work_order_loads').select('id').eq('work_order_id', workOrderId).eq('load_no', loadNo).limit(1);
    if (readErr) return readErr.message;
    const existingId = (rows as { id: string }[] | null)?.[0]?.id;
    const { error: err } = existingId
      ? await supabase.from('work_order_loads').update(patch).eq('id', existingId)
      : await supabase.from('work_order_loads').insert({ work_order_id: workOrderId, load_no: loadNo, ...patch });
    return err ? err.message : null;
  }, [supabase, workOrderId]);

  // Send whatever is waiting on the phone, oldest first, stopping at the
  // first one that still can't get through.
  const flushQueue = useCallback(async () => {
    const mine = readQueue().filter((q) => q.workOrderId === workOrderId);
    if (mine.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    let sent = 0;
    for (const q of mine.sort((a, b) => a.at.localeCompare(b.at))) {
      const err = await writeStamp(q.loadNo, q.key, q.at, q.fix);
      if (err) break;
      writeQueue(readQueue().filter((x) => !(x.workOrderId === q.workOrderId && x.loadNo === q.loadNo && x.key === q.key)));
      setQueued((st) => { const n = { ...st }; delete n[`${q.loadNo}:${q.key}`]; return n; });
      sent++;
    }
    if (sent > 0) {
      setError('');
      refresh();
      pingTicketProgress(workOrderId);
    }
  }, [workOrderId, writeStamp, refresh]);

  // What was waiting when the page opened, then every time the signal
  // comes back, and every half minute while anything waits.
  useEffect(() => {
    const mine = readQueue().filter((q) => q.workOrderId === workOrderId);
    if (mine.length) setQueued(Object.fromEntries(mine.map((q) => [`${q.loadNo}:${q.key}`, q.at])));
    flushQueue();
    const onOnline = () => { flushQueue(); };
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => { if (readQueue().some((q) => q.workOrderId === workOrderId)) flushQueue(); }, 30_000);
    return () => { window.removeEventListener('online', onOnline); clearInterval(timer); };
  }, [workOrderId, flushQueue]);

  async function stamp(loadNo: number, key: LoadStampKey) {
    if (locked) return;
    const at = new Date().toISOString();
    const pk = `${loadNo}:${key}`;
    setPending((p) => ({ ...p, [pk]: at }));
    setBusy(pk); setError('');

    const fix = await getFix();
    // Anything already waiting goes first, so stamps land in order.
    await flushQueue();
    const err = await writeStamp(loadNo, key, at, fix);

    setBusy('');
    setPending((p) => { const n = { ...p }; delete n[pk]; return n; });
    if (err) {
      if (looksOffline(err)) {
        // No signal: keep it on the phone. The time and the fix are already
        // taken, so the stamp is as good as sent once it goes.
        writeQueue([...readQueue().filter((x) => !(x.workOrderId === workOrderId && x.loadNo === loadNo && x.key === key)),
          { workOrderId, loadNo, key, at, fix }]);
        setQueued((st) => ({ ...st, [pk]: at }));
        return;
      }
      setError(err);
      return;
    }
    refresh();
    pingTicketProgress(workOrderId);
  }

  async function clearStamp(load: WorkOrderLoad, key: LoadStampKey) {
    if (locked) return;
    setBusy(`${load.load_no}:${key}`); setError('');
    const { error: err } = await supabase.from('work_order_loads').update({
      [`${key}_at`]: null,
      [`${key}_lat`]: null,
      [`${key}_lng`]: null,
      [`${key}_accuracy`]: null,
    }).eq('id', load.id);
    setBusy('');
    if (err) { setError(err.message); return; }
    refresh();
    pingTicketProgress(workOrderId);
  }

  async function setField(loadNo: number, field: 'ticket_number' | 'tons' | 'material', value: string) {
    const existing = loads.find((l) => l.load_no === loadNo);
    const val = value === '' ? null : (field === 'tons' ? Number(value) : value);
    // Keep the field responsive while the write is in flight.
    setLoads((ls) => ls.map((l) => (l.load_no === loadNo ? { ...l, [field]: val } as WorkOrderLoad : l)));
    if (existing) {
      await supabase.from('work_order_loads').update({ [field]: val }).eq('id', existing.id);
    } else {
      await supabase.from('work_order_loads')
        .insert({ work_order_id: workOrderId, load_no: loadNo, [field]: val });
      refresh();
    }
    pingTicketProgress(workOrderId);
  }

  // The BOL photo, read: the ticket number and net tons go onto the load
  // (and the material, when the load has none yet), and the photo stays
  // with it. A scan that read nothing still keeps the picture.
  async function applyBol(loadNo: number, f: BolScan, path: string) {
    const existing = loads.find((l) => l.load_no === loadNo);
    const patch: Record<string, unknown> = { bol_photo_path: path };
    if (sv(f.ticket_number)) patch.ticket_number = sv(f.ticket_number);
    if (sn(f.net_tons)) patch.tons = Number(f.net_tons);
    if (sv(f.material) && !existing?.material) patch.material = sv(f.material);
    const { error: err } = existing
      ? await supabase.from('work_order_loads').update(patch).eq('id', existing.id)
      : await supabase.from('work_order_loads').insert({ work_order_id: workOrderId, load_no: loadNo, ...patch });
    if (err) { setError(err.message); return; }
    setError('');
    refresh();
    pingTicketProgress(workOrderId);
  }

  async function clearBol(load: WorkOrderLoad) {
    if (locked) return;
    await supabase.from('work_order_loads').update({ bol_photo_path: null }).eq('id', load.id);
    refresh();
  }

  // Open the BOL photo. The tab opens before the await — Safari blocks a
  // window.open that comes after one.
  async function openBol(path: string) {
    const tab = window.open('about:blank', '_blank');
    const { data } = await supabase.storage.from('work-tickets').createSignedUrl(path, 300);
    if (data?.signedUrl) { if (tab) tab.location.href = data.signedUrl; else window.location.href = data.signedUrl; }
    else tab?.close();
  }

  async function removeLoad(load: WorkOrderLoad) {
    if (locked) return;
    setBusy(`del${load.load_no}`);
    await supabase.from('work_order_loads').delete().eq('id', load.id);
    setBusy('');
    refresh();
    pingTicketProgress(workOrderId);
  }

  const nextNo = loads.length ? Math.max(...loads.map((l) => l.load_no)) + 1 : 1;
  // A blank row sits ready under the last one so the next load is always a
  // single tap away — no "add a row" step between loads.
  const showBlank = !locked && loads.length < MAX_LOADS;
  const tons = totalLoadTons(loads);
  const count = countLoads(loads);

  // ---- The floating stamp button ------------------------------------------
  // A driver mid-haul lives in the in/out cycle: load in → load out →
  // unload in → unload out → next load's in. After the first Load In on the
  // cards, this button floats over the page pre-armed with whichever stamp
  // comes next, so the whole day is the same thumb on the same spot. Hold and
  // drag to park it anywhere; the spot is remembered on the device.
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const fabRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAB_POS_KEY);
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) setFabPos(p);
      }
    } catch { /* corner default is fine */ }
  }, []);

  // The next stamp in the cycle, walking the last load that has any time on
  // it. Null (no button) until the first Load In, and again once all 28
  // lines are done.
  function nextStamp(): { loadNo: number; key: LoadStampKey; label: string } | null {
    const has = (l: { load_no: number } & Partial<WorkOrderLoad>, k: LoadStampKey) =>
      !!l[`${k}_at` as keyof WorkOrderLoad] || !!queued[`${l.load_no}:${k}`];
    // Loads known to the database, plus any that so far exist only as
    // stamps waiting on the phone.
    const known = new Map<number, { load_no: number } & Partial<WorkOrderLoad>>(loads.map((l) => [l.load_no, l]));
    for (const pk of Object.keys(queued)) {
      const no = Number(pk.split(':')[0]);
      if (!known.has(no)) known.set(no, { load_no: no });
    }
    const stamped = [...known.values()]
      .sort((a, b) => a.load_no - b.load_no)
      .filter((l) => LOAD_STAMPS.some((st) => has(l, st.key)));
    if (stamped.length === 0) return null;
    const active = stamped[stamped.length - 1];
    for (const st of LOAD_STAMPS) {
      if (!has(active, st.key)) return { loadNo: active.load_no, key: st.key, label: st.label };
    }
    if (active.load_no + 1 > MAX_LOADS) return null;
    return { loadNo: active.load_no + 1, key: 'load_in', label: 'Load in' };
  }
  const next = !locked && !loading ? nextStamp() : null;

  const clamp = (p: { x: number; y: number }) => {
    const w = fabRef.current?.offsetWidth ?? 140;
    const h = fabRef.current?.offsetHeight ?? 80;
    return {
      x: Math.min(Math.max(4, p.x), window.innerWidth - w - 4),
      y: Math.min(Math.max(4, p.y), window.innerHeight - h - 4),
    };
  };

  function fabPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = fabRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false };
  }
  function fabPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // A real drag, not a shaky thumb — below this it still counts as a tap.
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    setFabPos(clamp({ x: d.origX + dx, y: d.origY + dy }));
  }
  function fabPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      // Parked: remember the spot on this device.
      setFabPos((p) => {
        try { if (p) localStorage.setItem(FAB_POS_KEY, JSON.stringify(p)); } catch { /* fine */ }
        return p;
      });
    } else if (next && !busy) {
      stamp(next.loadNo, next.key);
    }
  }

  const input = 'w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm';

  function stampButton(loadNo: number, key: LoadStampKey, label: string, load?: WorkOrderLoad) {
    const pk = `${loadNo}:${key}`;
    const saved = load ? (load[`${key}_at`] as string | null) : null;
    const waiting = queued[pk];
    const shown = pending[pk] || saved || waiting;
    const hasFix = load ? load[`${key}_lat` as keyof WorkOrderLoad] != null : false;
    const working = busy === pk;

    if (waiting && !saved) {
      return (
        <div
          key={key}
          title="Saved on this phone. It sends itself when the signal comes back."
          className="flex flex-col items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-2 py-2"
        >
          <span className="text-[10px] uppercase tracking-wide text-amber-800">{label}</span>
          <span className="text-sm font-semibold text-amber-900 tabular-nums">{clockOf(waiting)}</span>
          <span className="text-[10px] text-amber-700">no signal · will send</span>
        </div>
      );
    }
    if (shown) {
      return (
        <button
          key={key}
          type="button"
          onClick={() => (load && !locked ? clearStamp(load, key) : undefined)}
          disabled={locked || working}
          title={locked ? undefined : 'Tap to clear'}
          className="flex flex-col items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-2 disabled:opacity-60"
        >
          <span className="text-[10px] uppercase tracking-wide text-emerald-800">{label}</span>
          <span className="text-sm font-semibold text-emerald-900 tabular-nums">
            {clockOf(shown)}
          </span>
          <span className="text-[10px] text-emerald-700">
            {working ? 'saving…' : hasFix ? '📍 located' : pending[pk] ? 'locating…' : 'no fix'}
          </span>
        </button>
      );
    }
    return (
      <button
        key={key}
        type="button"
        onClick={() => stamp(loadNo, key)}
        disabled={locked || working}
        className="flex flex-col items-center justify-center rounded-md border border-gray-300 bg-white px-2 py-2 hover:border-brand-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
      >
        <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
        <span className="text-sm font-semibold text-brand-700">Tap</span>
        <span className="text-[10px] text-gray-400">{working ? 'saving…' : '—'}</span>
      </button>
    );
  }

  function loadCard(loadNo: number, load?: WorkOrderLoad) {
    return (
      <div key={loadNo} className={`rounded-lg border p-3 ${load ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm font-semibold">
            Load {loadNo}
            {!load && <span className="ml-2 text-xs font-normal text-gray-500">tap a time to start it</span>}
          </span>
          {load && !locked && (
            <button
              type="button"
              onClick={() => removeLoad(load)}
              disabled={busy === `del${loadNo}`}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {LOAD_STAMPS.map((s) => stampButton(loadNo, s.key, s.label, load))}
        </div>

        {/* The inputs are uncontrolled so typing doesn't fight the refresh;
            the key remounts them when the saved value changes under them —
            which is what a BOL scan does. */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <label className="col-span-2">
            <span className="block text-[11px] text-gray-500 mb-0.5">Ticket # (scale / BOL)</span>
            <input
              key={`tn-${load?.ticket_number ?? ''}`}
              defaultValue={load?.ticket_number || ''}
              onBlur={(e) => setField(loadNo, 'ticket_number', e.target.value.trim())}
              disabled={locked}
              className={input}
            />
          </label>
          <label>
            <span className="block text-[11px] text-gray-500 mb-0.5">Tons</span>
            <input
              key={`tons-${load?.tons ?? ''}`}
              type="number" step="0.01" min="0" inputMode="decimal"
              defaultValue={load?.tons ?? ''}
              onBlur={(e) => setField(loadNo, 'tons', e.target.value.trim())}
              disabled={locked}
              className={input}
            />
          </label>
          <label className="col-span-2">
            <span className="block text-[11px] text-gray-500 mb-0.5">Material</span>
            <input
              key={`mat-${load?.material ?? ''}`}
              defaultValue={load?.material || ''}
              placeholder={defaultMaterial || undefined}
              onBlur={(e) => setField(loadNo, 'material', e.target.value.trim())}
              disabled={locked}
              className={input}
            />
          </label>
          <div>
            <span className="block text-[11px] text-gray-500 mb-0.5">BOL photo</span>
            {load?.bol_photo_path ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => openBol(load.bol_photo_path!)}
                  className="flex-1 px-2 py-1.5 text-sm rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 font-medium">
                  ✓ Photo
                </button>
                {!locked && (
                  <button type="button" onClick={() => clearBol(load)} title="Remove the photo" className="text-gray-400 hover:text-red-600 px-1">×</button>
                )}
              </div>
            ) : (
              <ScanButton kind="bol" bucket="work-tickets" folder="bol" small label="BOL" disabled={locked}
                onResult={(f, p) => applyBol(loadNo, f as BolScan, p)} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Loads</h2>
        <span className="text-sm text-gray-600">
          <strong>{count}</strong> {count === 1 ? 'load' : 'loads'} · <strong>{tons.toFixed(2)}</strong> tons
        </span>
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {Object.keys(queued).length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
          {Object.keys(queued).length === 1 ? '1 stamp is' : `${Object.keys(queued).length} stamps are`} saved on this phone and will send when the signal comes back. Keep the app open when you&apos;re back in range.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {loads.map((l) => loadCard(l.load_no, l))}
          {showBlank && loadCard(nextNo)}
          {loads.length >= MAX_LOADS && (
            <p className="text-xs text-gray-500">
              That&apos;s all 28 lines — the same as the paper ticket. Start a
              second ticket for anything past this.
            </p>
          )}
        </div>
      )}

      {/* The floating next-stamp button. touch-none stops the page scrolling
          out from under a drag. */}
      {next && (
        <div
          ref={fabRef}
          onPointerDown={fabPointerDown}
          onPointerMove={fabPointerMove}
          onPointerUp={fabPointerUp}
          onPointerCancel={() => { dragRef.current = null; }}
          style={fabPos
            ? { left: fabPos.x, top: fabPos.y }
            : { right: 16, bottom: 90 }}
          className="fixed z-50 touch-none select-none cursor-grab active:cursor-grabbing"
        >
          <div className={`rounded-2xl shadow-xl border-2 px-5 py-3 text-center min-w-[132px] ${
            busy
              ? 'bg-gray-500 border-gray-500 text-white'
              : next.key.startsWith('load')
                ? 'bg-brand-700 border-brand-900 text-white'
                : 'bg-accent-400 border-accent-500 text-white'
          }`}>
            <span className="block text-[10px] uppercase tracking-wide opacity-80">
              Load {next.loadNo}
            </span>
            <span className="block text-lg font-bold leading-tight">
              {busy ? 'Saving…' : next.label}
            </span>
            <span className="block text-[9px] opacity-70 mt-0.5">
              tap to stamp · hold &amp; drag to move
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
