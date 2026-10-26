# Live ticket progress — contract for the Auto 1 Funding app

For the funding app's agent. Bone (source `bone`) can show you a haul ticket
while it is still being worked, before the office approves it: loads so far,
tons so far, the hauler amount so far, who has signed. This document is the
one new endpoint that needs to exist on your side, next to the four from the
connection hand-off (`tickets`, `bill-of-sale`, `link-request`, `link-status`).

Everything here is a **preview**. A ticket becomes a fundable deal only when
the existing `POST {base}/tickets` arrives with `status: "approved_ready_to_fund"`.
Never fund on a progress message.

## Who gets previewed

Only tickets belonging to a hauling company whose Auto 1 Funding link is
**active** (`link-status` answers `linked`/`approved`). Bone checks that gate
before every send, using the same cached status your `link-status` and 403
answers maintain. Standard-pay tickets of a linked company are included
(`payment_method` tells you which), because the hauler often picks the pay
method late in the day; a ticket that ends up standard pay is withdrawn (below).

## The endpoint

`POST {base}/progress` — same base as the others, same auth:
`Authorization: Bearer <key>`, JSON body, 2xx within 8 seconds = accepted.

### Body

The shared ticket payload from the connection hand-off, plus:

```json
{
  "source": "bone",
  "ticket_id": "uuid — upsert key",
  "hauler_id": "uuid", "hauler": "company name",
  "supervisor_name": "...", "supervisor_signed_at": "ISO or null",
  "ticket_number": "...", "job_number": "...", "job_name": "...",
  "job_date": "YYYY-MM-DD", "phase_code": "...",
  "driver": "...", "unit_number": "...",
  "quantity": 6.5, "unit": "hrs", "rate": 145.0, "amount": 942.5,
  "hours": 6.5, "loads": 9, "tons": 271.3,

  "status": "in_progress",
  "ticket_status": "draft",
  "payment_method": "factor",
  "progress": {
    "loads_started": 9,
    "loads_completed": 8,
    "last_stamp_at": "ISO or null",
    "hours_so_far": 6.5,
    "submitted_at": "ISO or null",
    "driver_signed_at": "ISO or null",
    "supervisor_signed_at": "ISO or null",
    "sent_back": false
  }
}
```

- `status` is `in_progress` or `withdrawn`.
- `ticket_status` is Bone's own state: `draft` (being worked), `submitted`
  (done, waiting on the office), `rejected` (office sent it back; `sent_back`
  is true and the numbers are about to change).
- `payment_method` is `factor`, `standard`, or null (not chosen yet).
- `amount`, `quantity`, `hours`, `tons` are **so far**, at the hauler's own
  pay rate. The customer's rate never leaves Bone.

### What to do with it

- `in_progress` → upsert by `ticket_id` into a "coming in" list for that
  hauler. Show the numbers as estimates. Re-sends replace the previous copy.
- `withdrawn` → remove (or archive) that preview. Sent when the ticket is
  deleted or approved as standard pay. May arrive for a ticket you never saw;
  ignore it then.
- When `POST {base}/tickets` later arrives for the same `ticket_id` with
  `approved_ready_to_fund`, that supersedes the preview: promote it to the
  deal, as today.

### Answers

- `2xx` `{ "ok": true }` — accepted.
- `403` `{ "status": "none" | "pending" | "off" }` — the company isn't linked.
  Bone caches that and stops sending for that company (same as the other
  endpoints).
- `401` bad key, `400` bad body, `503` not configured, `5xx`/timeouts: Bone
  records the error on the ticket and tries again at the next change or
  sweep. Nothing on Bone's side ever waits on this call.

## Frequency

Bone sends on each meaningful change (a load stamped, the ticket saved or
submitted, a send-back) and sweeps every five minutes. A send is skipped when
nothing changed since the last one, so expect a handful of messages per
ticket per day, not one per second. Treat the endpoint as idempotent and
cheap; no response body beyond `ok` is needed.

## Bone's side (already built)

`sendTicketProgress` and `sweepTicketProgress` in `lib/factoring.ts`;
`POST /api/work-orders/[id]/progress` (pinged by the form and the load
lines); `GET /api/cron/factoring-progress` every five minutes;
`work_orders.factor_progress_sent_at / _hash / _error` on the row.
