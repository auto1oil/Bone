// "Finish your haul ticket." A ticket left open overnight is a day that can't
// be billed, so while one is open and started the driver is nudged: hourly
// from 6 to 11 in the evening, and at 6 the next morning for anything older.
// The office can send the same nudge by hand. The cron and the button both
// come through here.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUsers } from '@/lib/webpush';
import { ticketLabel } from '@/lib/work-orders';
import { YARD_TIME_ZONE } from '@/lib/yard-time';

// The yard's clock. Reminder hours and "today" are read in this zone, not
// the server's (UTC).
export { YARD_TIME_ZONE };

export function yardNow(now = new Date()): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: YARD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

export type OpenTicket = {
  id: string; ticket_no: number | null; job_date: string | null; job_name: string | null; job_number: string | null;
  submitted_by: string | null; assigned_to: string | null; loads_count: number | null; paper: boolean | null;
  reminded_at: string | null;
};

// A ticket the driver has actually started: loads stamped, or a paper copy.
// A job that was sent out and never begun isn't something to "finish".
export const isStarted = (t: Pick<OpenTicket, 'loads_count' | 'paper'>) => Number(t.loads_count || 0) > 0 || !!t.paper;

// Which open tickets get a reminder at this hour of the yard's day.
export function dueForReminder(t: OpenTicket, day: string, hour: number): boolean {
  if (!t.job_date || !isStarted(t)) return false;
  if (hour >= 18 && hour <= 23) return t.job_date <= day;   // tonight: today's and older
  if (hour === 6) return t.job_date < day;                  // morning: only what was left overnight
  return false;
}

// Send one reminder. The bell gets a line once a day per ticket; the push
// goes every time (it is the part that buzzes).
export async function remindDriver(db: SupabaseClient, t: OpenTicket, opts: { from?: string } = {}): Promise<boolean> {
  const who = t.assigned_to || t.submitted_by;
  if (!who) return false;
  const { day } = yardNow();
  const title = 'Finish your haul ticket';
  const what = [ticketLabel(t), t.job_name || (t.job_number ? `Job ${t.job_number}` : null), t.job_date && t.job_date !== day ? `from ${t.job_date}` : null]
    .filter(Boolean).join(' · ');
  const body = `${what} is still open. Add anything missing and tap Finish day.${opts.from ? ` (${opts.from})` : ''}`;
  const link = `/tickets/${t.id}`;
  try {
    const lastDay = t.reminded_at ? yardNow(new Date(t.reminded_at)).day : '';
    if (lastDay !== day || opts.from) {
      await db.from('notifications').insert({ recipient_id: who, kind: 'ticket_reminder', title, body, link });
    }
    await sendPushToUsers([who], { title, body, url: link });
    await db.from('work_orders').update({ reminded_at: new Date().toISOString() }).eq('id', t.id);
    return true;
  } catch {
    return false;
  }
}

export const OPEN_TICKET_COLUMNS =
  'id, ticket_no, job_date, job_name, job_number, submitted_by, assigned_to, loads_count, paper, reminded_at';
