// An address that opens in the phone's maps when tapped. Google Maps' search
// URL is the one target every phone handles: on an iPhone with Google Maps
// installed it opens the app, otherwise the browser; Apple Maps users get
// the web page with an "Open in Maps" bar. No coordinates needed.
//
// The office sometimes pastes a map link instead of typing the address. That
// opens as the link it is, and shows as "Map link" rather than a long URL
// that pushes the page wider than the phone.
export default function MapLink({ address, className = '' }: { address: string | null | undefined; className?: string }) {
  const a = (address || '').trim();
  if (!a) return null;
  const isLink = /^https?:\/\/\S+$/i.test(a);
  return (
    <a
      href={isLink ? a : `https://maps.google.com/?q=${encodeURIComponent(a)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-brand-700 underline decoration-dotted underline-offset-2 hover:decoration-solid [overflow-wrap:anywhere] ${className}`}
      title={isLink ? a : 'Open in maps'}
    >
      {isLink ? 'Map link' : a}
      <span aria-hidden="true" className="ml-1 text-xs">📍</span>
    </a>
  );
}
