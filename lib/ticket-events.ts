// The ticket's history: one line each time something happens to a ticket,
// with who did it and when. It is the permanent record behind "which
// tickets did we approve, which did we send back, and why" — a sent-back
// ticket's reason is otherwise gone the moment the driver fixes it.
//
// Lines are written by the server routes that make the change, through the
// service role. Writing is best-effort: a history line that fails to save
// never fails the approval, the send-back or the invoice it describes.

import type { SupabaseClient } from '@supabase/supabase-js';

export const EVENT_KINDS = {
  sent_to_driver: 'Sent to the driver',
  taken_back: 'Taken back from the driver',
  finished: 'Finished by the driver',
  resubmitted: 'Fixed and turned in again',
  sent_back: 'Sent back',
  approved: 'Approved',
  invoiced: 'Invoice sent',
  invoice_failed: 'Invoice did not go',
  invoice_voided: 'Invoice voided',
  moved_job: 'Moved to another job',
  reminded: 'Driver reminded',
} as const;
export type TicketEventKind = keyof typeof EVENT_KINDS;

export type TicketEvent = {
  id: string;
  work_order_id: string | null;
  at: string;
  kind: TicketEventKind;
  actor_id: string | null;
  actor_name: string | null;
  detail: string | null;
  ticket_label: string | null;
  job: string | null;
};

// How a line reads in a list: green for a pass, red for a bounce.
export function eventTone(kind: string): string {
  if (kind === 'approved' || kind === 'invoiced') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (kind === 'sent_back' || kind === 'invoice_voided' || kind === 'invoice_failed') return 'bg-red-50 text-red-800 border-red-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
}

type TicketRef = { id: string; ticket_no?: number | null; job_name?: string | null; job_number?: string | null };

export async function logTicketEvent(
  db: SupabaseClient,
  ticket: TicketRef,
  kind: TicketEventKind,
  actor: { id: string | null; name?: string | null } | null,
  detail?: string | null,
): Promise<void> {
  try {
    await db.from('work_order_events').insert({
      work_order_id: ticket.id,
      kind,
      actor_id: actor?.id ?? null,
      actor_name: actor?.name ?? null,
      detail: detail ? String(detail).slice(0, 500) : null,
      ticket_label: ticket.ticket_no != null ? `HT-${ticket.ticket_no}` : null,
      job: ticket.job_name || (ticket.job_number ? `Job ${ticket.job_number}` : null),
    });
  } catch { /* the change it describes already happened */ }
}
