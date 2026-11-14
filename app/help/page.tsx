'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { marked, Renderer } from 'marked';

// The user guide, inside the app. The source is public/user-guide.md — the
// same file that ships in the repo and that the PDF is built from — so there
// is one guide to keep right. The ? in the nav links here with the anchor of
// the reader's own role; headings get stable ids for that.

export const dynamic = 'force-dynamic';

function slug(text: string): string {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

export default function HelpPage() {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/user-guide.md', { cache: 'no-store' });
        if (!res.ok) throw new Error(`guide not found (${res.status})`);
        const md = await res.text();
        const renderer = new Renderer();
        renderer.heading = ({ text, depth }) => {
          const id = slug(text);
          return `<h${depth} id="${id}"><a href="#${id}" class="no-underline">${text}</a></h${depth}>`;
        };
        const out = await marked.parse(md, { renderer, gfm: true });
        if (!cancelled) setHtml(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'could not load the guide');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Once the content is in, go to the section the ? asked for.
  useEffect(() => {
    if (!html) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 50);
  }, [html]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link href="/" className="text-sm text-brand-700 hover:underline">← Back to the app</Link>
          <a href="/user-guide.md" download="Bone-App-User-Guide.md" className="text-xs text-gray-500 hover:underline">Download</a>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!html && !error && <p className="text-sm text-gray-500">Loading the guide…</p>}
        {html && (
          <article
            className="help-prose bg-white border border-gray-200 rounded-lg p-5 sm:p-8"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
