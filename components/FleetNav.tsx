'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The fleet program's own tabs, under the main nav.
const TABS = [
  { href: '/fleet', label: 'Trucks' },
  { href: '/fleet/trips', label: 'Trips' },
  { href: '/fleet/fuel', label: 'Fuel' },
  { href: '/fleet/maintenance', label: 'Maintenance' },
  { href: '/fleet/documents', label: 'Documents' },
  { href: '/fleet/ifta', label: 'IFTA' },
];

export default function FleetNav() {
  const pathname = usePathname() || '';
  return (
    <nav className="flex gap-1 mb-4 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const active = t.href === '/fleet' ? pathname === '/fleet' || pathname.startsWith('/fleet/vehicles') : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href}
            className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap border ${active ? 'bg-brand-50 border-brand-500 text-brand-900 font-medium' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
