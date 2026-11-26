// The ticket forms a haul ticket can print on. "bone" is Bone's own pad; the
// rest are the forms of the companies Bone hauls for, reproduced so the
// ticket a driver turns in is on that company's own layout. The day is
// entered the same way whatever the form — taps, BOL photos — and the form
// only decides how the finished ticket is laid out as a PDF.
//
// Client-safe: keys and labels only. The drawing code is in lib/ticket-forms.

export const TICKET_FORMATS = [
  { key: 'bone', label: 'Bone Trucking', title: 'Haul ticket' },
  { key: 'custom_trucking', label: 'Custom Trucking & Transportation', title: 'Custom Trucking & Transportation LLC' },
  { key: 'arise', label: 'Arise Trucking', title: 'Arise Trucking · Delivery ticket' },
  { key: 'whitaker', label: 'Whitaker Construction', title: 'Whitaker Construction · Driver Time Sheet / Load Count' },
  { key: 'uhb', label: 'Utah Home Building Company', title: 'Utah Home Building Company' },
  { key: 'osm', label: 'One Source Materials', title: 'One Source Materials · Truck Tickets' },
] as const;

export type TicketFormatKey = (typeof TICKET_FORMATS)[number]['key'];

export function ticketFormat(key: string | null | undefined): TicketFormatKey {
  return (TICKET_FORMATS.find((f) => f.key === key)?.key ?? 'bone') as TicketFormatKey;
}
export function ticketFormatInfo(key: string | null | undefined) {
  const k = ticketFormat(key);
  return TICKET_FORMATS.find((f) => f.key === k)!;
}
