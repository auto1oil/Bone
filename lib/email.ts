// Outbound email, for the things the app sends to people outside it — the
// customer's invoice, first of all.
//
// Sent through Resend's HTTP API, with nothing but fetch. Two settings on
// the server turn it on:
//   RESEND_API_KEY      the key from resend.com
//   INVOICE_FROM_EMAIL  who it comes from, on a domain verified in Resend,
//                       e.g.  Bone Trucking <billing@yourdomain.com>
// Without them nothing is sent and the caller is told why, so the invoice
// still exists and can be sent the moment email is set up.

import { BRAND } from '@/lib/brand';

export type EmailAttachment = { filename: string; content: Uint8Array };

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.INVOICE_FROM_EMAIL;
}

// A plain check, enough to catch a typo before a send is attempted.
export function looksLikeEmail(v: string | null | undefined): boolean {
  return !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVOICE_FROM_EMAIL;
  if (!key || !from) {
    return { ok: false, error: 'Email isn’t set up on the server yet, so it wasn’t sent.' };
  }
  if (!looksLikeEmail(opts.to)) return { ok: false, error: `"${opts.to}" isn’t an email address.` };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [opts.to.trim()],
        // Replies go to the office, not to the sending address.
        reply_to: BRAND.officeEmail,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
        attachments: (opts.attachments || []).map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content).toString('base64'),
        })),
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null) as { message?: string } | null;
    return { ok: false, error: `The email service refused it (${res.status})${body?.message ? `: ${body.message}` : ''}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'The email service could not be reached.' };
  }
}
