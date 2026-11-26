/**
 * The "how it works" diagrams on /about, as data.
 *
 * Kept apart from the React Flow component so the facts can be tested without
 * a canvas, and so a diagram that drifts from the code is a one-file change.
 * Every box names a real module or route; the guide that explains the same
 * structure in prose is docs/guides/ARCHITECTURE.md.
 */

export type NodeKind = 'client' | 'server' | 'store' | 'external' | 'logic';

export interface DiagramNode {
  id: string;
  label: string;
  /** What it is and why it is there. Shown when the box is selected. */
  detail: string;
  kind: NodeKind;
  x: number;
  y: number;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Diagram {
  id: string;
  title: string;
  /** One sentence: the question this diagram answers. */
  summary: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export const KIND_LABEL: Record<NodeKind, string> = {
  client: 'Browser',
  server: 'Our server',
  store: 'Data store',
  external: 'Outside service',
  logic: 'Pure logic',
};

const SYSTEM: Diagram = {
  id: 'system',
  title: 'The whole system',
  summary: 'What talks to what, and which side holds the secrets.',
  nodes: [
    {
      id: 'landing',
      label: '/ landing page',
      detail:
        'Static and fast. It is the only page that converts visitors, so it ships no Firebase in its first bundle.',
      kind: 'client',
      x: 0,
      y: 0,
    },
    {
      id: 'app',
      label: '/app map product',
      detail:
        'MapLibre on OpenFreeMap tiles. State and wiring live in app/app/page.tsx; discovery and location are separate hooks.',
      kind: 'client',
      x: 0,
      y: 130,
    },
    {
      id: 'tiles',
      label: 'Tiles, search, area label',
      detail:
        'OpenFreeMap vector tiles, Photon search and Nominatim reverse geocoding. The browser calls them directly; none needs a key.',
      kind: 'external',
      x: 0,
      y: 260,
    },
    {
      id: 'routes',
      label: 'Route handlers (src/app/api)',
      detail:
        'Every secret lives here. Each route is rate-limited from one table, and anything that writes user data takes the uid from a verified ID token, never the request body.',
      kind: 'server',
      x: 300,
      y: 130,
    },
    {
      id: 'auth',
      label: 'Firebase Auth',
      detail: 'Google and Apple sign-in. The browser sends only its ID token to our routes.',
      kind: 'store',
      x: 600,
      y: 0,
    },
    {
      id: 'firestore',
      label: 'Firestore',
      detail:
        'Saved places, plans and trips are written by the browser under its own uid. Everything else is Admin SDK only. Rules do not cascade, so each subcollection has its own block.',
      kind: 'store',
      x: 600,
      y: 130,
    },
    {
      id: 'upstream',
      label: 'Gemini, Strava, OSRM, weather, OSM',
      detail:
        'Gemini Flash for chat, Strava OAuth and activities, OSRM routing, Google Weather with an OpenWeather fallback, Waymarked Trails, Photon and OpenTopoData for discovery.',
      kind: 'external',
      x: 600,
      y: 260,
    },
  ],
  edges: [
    { from: 'landing', to: 'app', label: 'Open the map' },
    { from: 'app', to: 'tiles' },
    { from: 'app', to: 'routes', label: 'ID token' },
    { from: 'app', to: 'firestore', label: 'own saved places, plans, trips' },
    { from: 'app', to: 'auth', label: 'sign in' },
    { from: 'routes', to: 'firestore', label: 'Admin SDK' },
    { from: 'routes', to: 'auth', label: 'verify token' },
    { from: 'routes', to: 'upstream' },
  ],
};

const DISCOVERY: Diagram = {
  id: 'discovery',
  title: 'Finding a route',
  summary: 'How a location becomes routes, peaks and campsites without paying for any of it.',
  nodes: [
    {
      id: 'location',
      label: 'useUserLocation',
      detail:
        'The only geolocation call in the app. It reports whether the position is a real fix, a restored one or a fallback, and a fallback is never drawn as you.',
      kind: 'client',
      x: 0,
      y: 120,
    },
    {
      id: 'local',
      label: 'localStorage, 24 h',
      detail: 'Keyed on the 0.1° cell, so a previous area never shows in a new one.',
      kind: 'store',
      x: 260,
      y: 0,
    },
    {
      id: 'cache',
      label: '/api/places/cache',
      detail:
        'A shared Firestore cache in 0.5° cells. Anyone may read it; writes need a signed-in user.',
      kind: 'server',
      x: 260,
      y: 120,
    },
    {
      id: 'discover',
      label: '/api/discover',
      detail:
        'Asks the OpenStreetMap services for the 0.1° cell. A failing collection is named in `failed`; only a complete answer is CDN-cached for a week.',
      kind: 'server',
      x: 260,
      y: 240,
    },
    {
      id: 'osm',
      label: 'Waymarked Trails, Photon, OpenTopoData',
      detail:
        'Route geometry with measured length, peaks and campsites by name, and heights from terrain. Free, shared and volunteer-run, so each is proxied and cached.',
      kind: 'external',
      x: 540,
      y: 240,
    },
    {
      id: 'places',
      label: 'usePlacesData',
      detail:
        'Reads the three tiers in order and merges them. Unknown values stay unknown rather than becoming zero.',
      kind: 'logic',
      x: 540,
      y: 120,
    },
    {
      id: 'details',
      label: 'Sidebar and DetailsModal',
      detail:
        'Routes, Peaks, Camps, History and Saved. Opening a route measures its real climb from terrain, then rates its difficulty.',
      kind: 'client',
      x: 800,
      y: 120,
    },
  ],
  edges: [
    { from: 'location', to: 'places', label: 'position' },
    { from: 'places', to: 'local', label: '1st' },
    { from: 'places', to: 'cache', label: '2nd' },
    { from: 'places', to: 'discover', label: '3rd' },
    { from: 'discover', to: 'osm' },
    { from: 'places', to: 'details' },
  ],
};

const READINESS: Diagram = {
  id: 'readiness',
  title: 'Am I ready?',
  summary: 'How training history and a route become one answer, gated by the weakest factor.',
  nodes: [
    {
      id: 'sources',
      label: 'Strava, GPX, Apple Health',
      detail:
        'Strava syncs through server-held tokens. Garmin, COROS and Komoot arrive as GPX; Apple Health as export.xml. Files are parsed in the browser.',
      kind: 'external',
      x: 0,
      y: 0,
    },
    {
      id: 'activities',
      label: 'Activities',
      detail: 'Deduplicated across sources, kept on the device and, for Strava, in Firestore.',
      kind: 'store',
      x: 260,
      y: 0,
    },
    {
      id: 'fitness',
      label: 'Last 8 weeks, ledger',
      detail:
        'A month-to-date score with targets pro-rated by days elapsed, plus lifetime totals and personal bests that survive the month rollover.',
      kind: 'logic',
      x: 520,
      y: 0,
    },
    {
      id: 'route',
      label: 'Route: length, climb',
      detail:
        'Length measured from the mapped path. Climb measured from terrain along it, or the route is left unrated; it is never guessed.',
      kind: 'client',
      x: 0,
      y: 200,
    },
    {
      id: 'difficulty',
      label: 'Difficulty (NPS formula)',
      detail:
        'From distance and ascent, rated the harder way round because a mapped route has no direction. Unknown has its own band.',
      kind: 'logic',
      x: 260,
      y: 200,
    },
    {
      id: 'readiness',
      label: 'Readiness',
      detail:
        'Gated by the limiting factor, never averaged, so the answer names what to train. The ready band sorts by demand, not score.',
      kind: 'logic',
      x: 520,
      y: 100,
    },
    {
      id: 'weather',
      label: 'Weather window',
      detail:
        'The soonest span long enough for this route, from the forecast and the route duration. A warning hour is disqualifying, never discounted.',
      kind: 'logic',
      x: 520,
      y: 220,
    },
    {
      id: 'answer',
      label: 'Ready, stretch, or a plan',
      detail:
        'Routes you are ready for, a stretch band just beyond, and a week-by-week progression at 10% a week when the answer is not yet.',
      kind: 'client',
      x: 780,
      y: 100,
    },
  ],
  edges: [
    { from: 'sources', to: 'activities' },
    { from: 'activities', to: 'fitness' },
    { from: 'route', to: 'difficulty' },
    { from: 'fitness', to: 'readiness' },
    { from: 'difficulty', to: 'readiness' },
    { from: 'route', to: 'weather', label: 'duration' },
    { from: 'readiness', to: 'answer' },
    { from: 'weather', to: 'answer', label: 'when' },
  ],
};

const TRUST: Diagram = {
  id: 'trust',
  title: 'Trust and safety',
  summary: 'What stands between a request and your data.',
  nodes: [
    {
      id: 'request',
      label: 'Request with ID token',
      detail: 'The browser sends only its Firebase ID token. A uid in a body is never an identity.',
      kind: 'client',
      x: 0,
      y: 100,
    },
    {
      id: 'identity',
      label: 'requireUser / requireRole',
      detail:
        'Verifies the token. Admin routes also check the ADMIN_EMAILS allowlist or the role claim, and fail closed when the list is empty.',
      kind: 'server',
      x: 260,
      y: 100,
    },
    {
      id: 'limit',
      label: 'Rate limit',
      detail:
        'Every route has a budget in one table, keyed by verified uid and by IP otherwise. A test fails the build if a route ships without one.',
      kind: 'server',
      x: 520,
      y: 100,
    },
    {
      id: 'handler',
      label: 'Route handler',
      detail:
        'Logs through one logger that redacts by key. Upstream failures say which service failed and offer a retry.',
      kind: 'server',
      x: 780,
      y: 100,
    },
    {
      id: 'audit',
      label: 'Audit log',
      detail: 'Append-only. Records denied admin attempts, purges and erasures, kept 730 days.',
      kind: 'store',
      x: 780,
      y: 240,
    },
    {
      id: 'footprint',
      label: 'User data footprint',
      detail:
        'One list of every place user data lives. Export and erasure both walk it, so a new collection cannot be forgotten.',
      kind: 'logic',
      x: 520,
      y: 240,
    },
    {
      id: 'sweep',
      label: 'Daily expiry sweep',
      detail:
        'Vercel Cron deletes expired rate limits, chats, audit entries and cache. It stays on the free Firebase plan, so it is a sweep rather than TTL.',
      kind: 'server',
      x: 260,
      y: 240,
    },
  ],
  edges: [
    { from: 'request', to: 'identity' },
    { from: 'identity', to: 'limit' },
    { from: 'limit', to: 'handler' },
    { from: 'handler', to: 'audit', label: 'privileged acts' },
    { from: 'handler', to: 'footprint', label: 'export, delete' },
    { from: 'sweep', to: 'audit', label: 'after 730 days' },
  ],
};

export const DIAGRAMS: Diagram[] = [SYSTEM, DISCOVERY, READINESS, TRUST];
