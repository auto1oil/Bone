// POST /api/fleet/scan — read a photo of a registration, a fuel receipt or a
// shop bill and hand back the fields for the form.
//
// The photo is already in the fleet-docs bucket (the Scan button uploads it
// first, so the paper is kept whatever the scanner makes of it); the body is
// { path, kind }. This runs as the service role to fetch the file, so it
// checks the caller is Bone staff itself — the same line the fleet RLS
// draws. The answer is a suggestion: the form shows it, the person checks
// it, nothing is saved here.

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { SCAN_SCHEMAS, SCAN_PROMPTS, type ScanKind } from '@/lib/fleet-scan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STAFF = ['driver', 'mechanic', 'labor', 'office', 'admin', 'master_admin'];
const KINDS: ScanKind[] = ['registration', 'fuel', 'maintenance'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Scanning is not switched on for this app yet (no API key).' }, { status: 503 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role, hauler_id').eq('id', user.id).single();
  if (!me || !STAFF.includes(me.role) || me.hauler_id) {
    return NextResponse.json({ ok: false, error: 'Bone staff only' }, { status: 403 });
  }

  let body: { path?: string; kind?: string } = {};
  try { body = await req.json(); } catch { /* fall through */ }
  const path = typeof body.path === 'string' ? body.path : '';
  const kind = body.kind as ScanKind;
  if (!path || !KINDS.includes(kind)) {
    return NextResponse.json({ ok: false, error: 'need path and kind' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: blob, error: dlErr } = await admin.storage.from('fleet-docs').download(path);
  if (dlErr || !blob) return NextResponse.json({ ok: false, error: `Could not read the file: ${dlErr?.message || 'missing'}` }, { status: 404 });
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'That file is too big to scan (20 MB max).' }, { status: 413 });
  const data = bytes.toString('base64');

  const mime = (blob.type || '').split(';')[0].toLowerCase();
  const isPdf = mime === 'application/pdf' || path.toLowerCase().endsWith('.pdf');
  const imageType: ImageType = (IMAGE_TYPES as readonly string[]).includes(mime) ? (mime as ImageType) : 'image/jpeg';

  const source: Anthropic.ContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: imageType, data } };

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 2048,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCAN_SCHEMAS[kind] } },
      system:
        'You read paperwork for a Utah dump-truck company and return exactly the fields asked for. ' +
        'Only report what is actually on the document. When a value is not there or cannot be read, return null. ' +
        'Never invent numbers, dates or identifiers.',
      messages: [{ role: 'user', content: [source, { type: 'text', text: SCAN_PROMPTS[kind] }] }],
    });
    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ ok: false, error: 'The scanner would not read this one. Type it in by hand.' }, { status: 422 });
    }
    const fields = (response.parsed_output ?? null) as Record<string, unknown> | null;
    if (!fields) return NextResponse.json({ ok: false, error: 'Could not make out the fields. Try a straighter, closer photo.' }, { status: 422 });
    return NextResponse.json({ ok: true, kind, fields });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ ok: false, error: 'The scanning API key is wrong or expired.' }, { status: 502 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ ok: false, error: 'Scanner is busy. Try again in a minute.' }, { status: 503 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ ok: false, error: `Scanner error ${e.status}: ${e.message}` }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Scan failed.' }, { status: 500 });
  }
}
