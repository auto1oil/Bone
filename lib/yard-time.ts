// The yard's clock. Anything the server prints or schedules by time of day
// (the ticket PDF, the customer forms, the evening reminders) is read in
// this zone, never the server's, which runs on UTC.

export const YARD_TIME_ZONE = 'America/Denver';

function parts(iso: string | null | undefined): Record<string, string> | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: YARD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d)) out[p.type] = p.value;
  return out;
}

// "7:05 AM" in yard time; '' for nothing.
export function yardClock(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${p.hour}:${p.minute} ${p.dayPeriod}` : '';
}

// "2026-11-26 7:05 AM" in yard time; '' for nothing.
export function yardStamp(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.dayPeriod}` : '';
}
