import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

import { ThemeProvider } from '@/components/ThemeProvider';

/**
 * `viewport-fit=cover` plus the safe-area insets in `globals.css` keep the dock
 * clear of the home indicator once the app is installed and running without a
 * browser chrome to sit under. `userScalable` stays on: pinch-zooming a map
 * legend or a forecast table with cold hands is a real need, and disabling it
 * to stop double-tap zoom would fail WCAG 1.4.4.
 */
export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  userScalable: true,
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Fit Ready IQ — Adventure Readiness Platform',
  description:
    'Discover trails, mountains, and campsites near you. Track your fitness readiness for any adventure.',
  keywords: 'hiking, trail finder, adventure, fitness, route planning, mountains, camping',
  applicationName: 'Fit Ready IQ',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/icon.svg',
    // iOS ignores SVG here and silently falls back to a screenshot of the page.
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Fit Ready IQ',
    statusBarStyle: 'black-translucent',
  },
};

/**
 * Applies the stored theme before the first paint.
 *
 * This has to be a blocking inline script in `<head>`. The theme lives in
 * `localStorage`, which the server cannot read, so the server always renders
 * the default — and any React-side restore runs *after* the first paint. A
 * visitor who chose light would get a full frame of dark first: the flash of
 * wrong theme, which is worse on this app than most because the page is
 * near-black and the flash is a strobe.
 *
 * Deliberately duplicates the logic in `src/lib/theme.ts` rather than importing
 * it, because nothing bundled can run this early. Keep the two in step — the
 * class name (`light`), the storage key (`fri_theme`) and the default (dark).
 *
 * Wrapped in try/catch: `localStorage` throws outright in some hardened and
 * private-browsing configurations, and an exception here would run before
 * anything else on the page.
 */
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem('fri_theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    var root = document.documentElement;
    if (theme === 'light') root.classList.add('light');
    root.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f8fafc' : '#020617');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning className="bg-slate-950 font-sans antialiased">
        {/* First thing in the body, and blocking: it sets the class on <html>
            before any of the content below is parsed, so nothing paints in the
            wrong theme. Not in <head> — the App Router owns that element, and
            the theme-color meta tag this script updates is emitted there by the
            metadata API, so running after it is what makes the lookup succeed. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Keyboard users had to tab through the whole header on every page to
            reach content. Visible only once focused. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
