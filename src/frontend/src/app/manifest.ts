import type { MetadataRoute } from 'next';

/**
 * The web app manifest, which is what makes this installable.
 *
 * This is an app people use on a mountain, and until now it could not be put on
 * a home screen at all — there was no manifest, no PNG icons and no standalone
 * display mode, so it opened in a browser tab with a URL bar eating the map.
 *
 * `start_url` is `/app`, not `/`: someone who installs this has already decided
 * to use the product, and sending them to the marketing page on every launch
 * would be a tax on the people most committed to it.
 *
 * Installability is not offline capability. There is no service worker yet, so
 * an installed app still needs the network — the offline Trip pack described in
 * ADR-0003 is the separate piece of work that changes that, and this manifest
 * is its prerequisite rather than a substitute for it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fit Ready IQ — Adventure Readiness Platform',
    short_name: 'Fit Ready IQ',
    description:
      'Know whether you can finish a route before you start it. Trails, summits and campsites scored against your real training.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#020617',
    theme_color: '#020617',
    categories: ['health', 'fitness', 'navigation', 'sports'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable duplicates so Android can crop to its own shape without
      // clipping the peak out of the mark.
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
