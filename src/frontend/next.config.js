const fs = require('node:fs');
const path = require('node:path');

/**
 * Load the repo-root `.env.local`.
 *
 * Next only auto-loads env files sitting in its own project directory
 * (`src/frontend`), so a single file at the repo root — shared with the FastAPI
 * backend, which reads it via `env_file` in src/config/settings.py — has to be
 * loaded explicitly, and it has to happen here: this module is evaluated before
 * compilation, which is when `NEXT_PUBLIC_*` values get inlined into the client
 * bundle. Loading any later would leave those undefined in the browser.
 *
 * `process.loadEnvFile` is Node's own parser (20.12+), so there is no dependency
 * to add and quoting behaves exactly as `--env-file` does — which matters for
 * FIREBASE_PRIVATE_KEY, whose value carries escaped newlines.
 *
 * Existence-guarded rather than wrapped in a bare try/catch: on Vercel there is
 * no file and the variables arrive from the dashboard, so absence is the normal
 * production case and must not look like an error. Real env vars already in
 * `process.env` are not clobbered.
 */
const ROOT_ENV = path.resolve(__dirname, '..', '..', '.env.local');
if (fs.existsSync(ROOT_ENV)) {
  process.loadEnvFile(ROOT_ENV);
}

/**
 * Content-Security-Policy, in two parts.
 *
 * CSP is the one header that breaks a working page when you get it wrong, and
 * this app loads a lot at runtime: the Maps JS SDK pulls further scripts and
 * workers, Firebase Auth opens provider popups, and the radar layer fetches
 * third-party tiles. So it lands the way CSP is meant to land.
 *
 * ENFORCED — directives whose correct value is not in doubt. None of them
 * govern where content may load *from*, so none can break the map, and each
 * closes a real attack: `object-src 'none'` (plugin-based script injection),
 * `base-uri 'self'` (a stray <base> silently re-pointing every relative URL),
 * `form-action 'self'` (an injected form posting credentials off-origin), and
 * `frame-ancestors 'none'` (clickjacking).
 *
 * REPORT-ONLY — the full resource policy. It is enforced by nobody yet, but the
 * browser reports every violation, which turns "would this break the map?" from
 * a guess into a list. Once a deploy has run clean, move these directives into
 * CSP_ENFORCED and delete the report-only header. Set CSP_REPORT_URI to collect
 * the reports centrally; without it they appear in each visitor's console only.
 */
const CSP_BASELINE = [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const CSP_RESOURCE_POLICY = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval': Next's hydration bootstrap is an inline
  // script and the Maps SDK evaluates generated code. Removing them needs
  // per-request nonces, which is a separate change from introducing CSP at all.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com",
  // Tailwind is compiled, but both Next and the Maps SDK inject style tags.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Map tiles, Places photos, Google avatars, and the rainviewer radar overlay.
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com https://lh3.googleusercontent.com https://images.unsplash.com https://tilecache.rainviewer.com",
  // Our own API routes, Firebase Auth/Firestore, Maps, and the radar index.
  "connect-src 'self' https://*.googleapis.com https://maps.gstatic.com https://api.rainviewer.com https://tilecache.rainviewer.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Firebase Auth sign-in popups for Google and Apple.
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://appleid.apple.com",
  "worker-src 'self' blob:",
  ...CSP_BASELINE,
];

/**
 * Whether the resource policy is enforced or merely reported.
 *
 * The policy above has been report-only since it was introduced, which means
 * that for every deploy since, the directives that actually stop an injected
 * script reaching an attacker's host have been advisory. Report-only was the
 * right way to *introduce* it; leaving it there indefinitely means the app
 * carries the maintenance cost of a CSP and none of the protection.
 *
 * The switch is an environment variable rather than a code edit so that the
 * rollout is an operational step with an instant rollback: turn it on in
 * preview, exercise the map, sign-in popups and radar layer, then turn it on in
 * production — and if something was missed, unset it and the page recovers on
 * the next request instead of waiting for a deploy.
 *
 * Both headers are sent while it is off, so violations keep being reported.
 * Once it has run enforced in production for a release, make this the default
 * and delete the flag.
 *
 * See docs/runbooks/csp-enforcement.md.
 */
const CSP_ENFORCE_RESOURCES = process.env.CSP_ENFORCE_RESOURCES === 'true';

const withReportUri = (directives) =>
  [
    ...directives,
    ...(process.env.CSP_REPORT_URI ? [`report-uri ${process.env.CSP_REPORT_URI}`] : []),
  ].join('; ');

const CSP_ENFORCED = withReportUri(CSP_ENFORCE_RESOURCES ? CSP_RESOURCE_POLICY : CSP_BASELINE);

/** Redundant once the policy is enforced; omitted then so the header is not sent twice. */
const CSP_REPORT_ONLY = CSP_ENFORCE_RESOURCES ? null : withReportUri(CSP_RESOURCE_POLICY);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Playwright drives the dev server over 127.0.0.1 while Next binds
  // localhost; Next 16 blocks that as cross-origin without this. Dev only.
  allowedDevOrigins: ['127.0.0.1'],

  // Environment variables available to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4790',
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Fit-Ready-IQ',
  },

  /**
   * Security headers.
   *
   * Everything here is a default the browser applies when we say nothing —
   * and the defaults are the permissive ones. Without these the app can be
   * framed by any site (clickjacking a map that has a signed-in session),
   * leaks full URLs including `?place=` deep links in the Referer to every
   * third party we link out to, and hands any embedded page the geolocation
   * and camera permissions this origin holds.
   *
   * On the Content-Security-Policy, see CSP_ENFORCED / CSP_REPORT_ONLY below.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Deny framing outright — nothing in this product is meant to be embedded.
          // X-Frame-Options is redundant next to frame-ancestors for modern
          // browsers, and kept for the ones that never learned CSP.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: CSP_ENFORCED },
          ...(CSP_REPORT_ONLY
            ? [{ key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY }]
            : []),
          // Stop content-type sniffing turning an uploaded GPX into script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Send the origin to other sites, the full URL to ourselves.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Geolocation is ours to use; nobody we embed needs it, or the rest.
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
          },
          // Two years, preload-eligible. Vercel serves HTTPS only, so there is
          // no plaintext deployment for this to lock anyone out of.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        // Per-caller responses: one user's activities or sync status held in a
        // shared cache and served to the next is the failure worth a header.
        //
        // Scoped rather than blanket `/api/:path*`: a `headers()` entry wins over
        // the `Cache-Control` a route handler sets on its own response, and
        // /api/health and /api/directions both deliberately opt into shared
        // caching. Blanketing the whole tree would silently undo that.
        source: '/api/:path(strava|admin)/:rest*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
        pathname: '/maps/**',
      },
      {
        protocol: 'https',
        hostname: 'maps.gstatic.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'geo0.ggpht.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'geo1.ggpht.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'geo2.ggpht.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'geo3.ggpht.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
