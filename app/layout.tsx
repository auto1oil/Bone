import './globals.css';
import type { Metadata, Viewport } from 'next';
import { BRAND } from '@/lib/brand';
import PwaRegister from '@/components/PwaRegister';
import PullToRefresh from '@/components/PullToRefresh';
import Watermark from '@/components/Watermark';
import AppUpdater from '@/components/AppUpdater';
import FloatingButton from '@/components/FloatingButton';
import LocationReporter from '@/components/LocationReporter';

export const metadata: Metadata = {
  title: `${BRAND.name} — Field Tickets`,
  description: 'Field tickets, approvals, and invoicing for hauling crews.',
  manifest: '/manifest.webmanifest',
  // iOS "Add to Home Screen" treats this app as a standalone PWA (no
  // Safari chrome) with the Bone icon and our app title.
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: 'default',
  },
  icons: {
    // The tab icon is the horse on its own. The home-screen icon is the
    // solid one — a phone crops that to a circle, which a bare silhouette
    // does not survive.
    icon: '/brand/bone-mark.png',
    apple: '/brand/bone-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0C0C0D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Apply the saved theme before paint to avoid a flash of light mode. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='medium'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>
        <PwaRegister />
        <AppUpdater />
        <LocationReporter />
        <PullToRefresh />
        {children}
        <FloatingButton />
        <Watermark />
      </body>
    </html>
  );
}
