// Fire-and-forget: tell the server a ticket moved so the funding app's live
// preview can be refreshed. The browser never talks to the funding app — the
// server decides whether anything is sent (linked company, open ticket,
// something actually changed). Failures are nobody's problem here; the
// five-minute sweep catches anything missed.
export function pingTicketProgress(workOrderId: string | null | undefined): void {
  if (!workOrderId || typeof fetch === 'undefined') return;
  try {
    fetch(`/api/work-orders/${workOrderId}/progress`, { method: 'POST', keepalive: true }).catch(() => null);
  } catch { /* ignore */ }
}
