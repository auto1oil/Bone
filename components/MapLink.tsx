// An address that opens in the phone's maps when tapped. Google Maps' search
// URL is the one target every phone handles: on an iPhone with Google Maps
// installed it opens the app, otherwise the browser; Apple Maps users get
// the web page with an "Open in Maps" bar. No coordinates needed.
export default function MapLink({ address, className = '' }: { address: string | null | undefined; className?: string }) {
  const a = (address || '').trim();
  if (!a) return null;
  return (
    <a
      href={`https://maps.google.com/?q=${encodeURIComponent(a)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-brand-700 underline decoration-dotted underline-offset-2 hover:decoration-solid ${className}`}
      title="Open in maps"
    >
      {a}
      <span aria-hidden="true" className="ml-1 text-xs">📍</span>
    </a>
  );
}
