/**
 * The release roadmap shown in-app.
 *
 * Kept as data, next to the code it describes, so a status here is checkable
 * against the repo rather than being a slide that quietly goes stale. Every
 * "done" item below corresponds to shipped code; every "pending" one names what
 * is actually missing rather than a wish.
 */

export type ItemStatus = 'done' | 'partial' | 'pending';

export interface RoadmapItem {
  title: string;
  status: ItemStatus;
  /** What changed, or what remains. One sentence. */
  detail: string;
}

export interface RoadmapPhase {
  id: string;
  title: string;
  /** The user-facing problem this phase existed to solve. */
  goal: string;
  items: RoadmapItem[];
}

export const ROADMAP: RoadmapPhase[] = [
  {
    id: 'foundations',
    title: 'Stop the silent failures',
    goal: 'The app should never fail quietly, and never claim something it cannot know.',
    items: [
      {
        title: 'One source of location truth',
        status: 'done',
        detail:
          'Three competing geolocation calls became one hook with a timeout. Denial is stated, not hidden behind a San Francisco fallback.',
      },
      {
        title: 'Never claim a guess is a fix',
        status: 'done',
        detail: 'The "Your Location" marker and "N km away" only appear for a real device fix.',
      },
      {
        title: 'Errors users can act on',
        status: 'done',
        detail:
          'Env-var names and Firebase console steps no longer reach visitors. Failed fetches offer a retry instead of an empty list.',
      },
      {
        title: 'Strava return path',
        status: 'done',
        detail: 'OAuth returns to the map, not the marketing page, with a readable outcome.',
      },
    ],
  },
  {
    id: 'honesty',
    title: 'Remove what is not real',
    goal: 'Nothing on screen should be invented, especially anything safety-adjacent.',
    items: [
      {
        title: 'Synthesised elevation profiles removed',
        status: 'done',
        detail: 'The chart was Math.sin() noise; the "50 m" on every route was a hardcoded floor.',
      },
      {
        title: 'Fabricated reviews and advisories removed',
        status: 'done',
        detail:
          'Hardcoded reviewer names, invented water sources and templated parking claims are gone.',
      },
      {
        title: 'Difficulty from terrain, not popularity',
        status: 'done',
        detail:
          'Was read off the Google star rating. Now the NPS formula over distance and ascent, with an Unrated band.',
      },
      {
        title: 'Real spend reporting',
        status: 'pending',
        detail:
          'Cost needs a Google Cloud Billing integration. Until then the admin panel reports cache reuse rather than a dollar figure.',
      },
    ],
  },
  {
    id: 'access',
    title: 'Usable by everyone',
    goal: 'Keyboard and screen-reader users should reach everything a mouse can.',
    items: [
      {
        title: 'Modals are dialogs',
        status: 'done',
        detail: 'Escape, backdrop dismissal, focus trap, focus restoration and scroll lock.',
      },
      {
        title: 'Map is keyboard-reachable',
        status: 'done',
        detail: 'Markers are buttons with labels; tabs are a real tablist with arrow keys.',
      },
      {
        title: 'Motion and skip links',
        status: 'done',
        detail: 'prefers-reduced-motion honoured; a skip link precedes every page.',
      },
      {
        title: 'Full audit against WCAG 2.2 AA',
        status: 'pending',
        detail: 'Contrast ratios and screen-reader flows have not been formally tested end to end.',
      },
    ],
  },
  {
    id: 'planning',
    title: 'Plan a trip, not just browse one',
    goal: 'Get from "this looks good" to something you can carry up the hill.',
    items: [
      {
        title: 'Route planner with GPX export',
        status: 'done',
        detail: 'Drop waypoints, reorder, export GPX that our own parser reads back.',
      },
      {
        title: 'Saved plans',
        status: 'done',
        detail: 'Plans persist on the device and reload with their waypoints and name.',
      },
      {
        title: 'Walking and cycling routing',
        status: 'done',
        detail:
          'Plan on foot or by bike on OpenStreetMap paths, with no API key. Where no route exists the planner says so rather than drawing a straight line.',
      },
      {
        title: 'Free map and place data',
        status: 'done',
        detail:
          'The map is MapLibre on OpenFreeMap tiles, and routes, peaks and campsites come from OpenStreetMap. Routes now carry their measured length instead of none.',
      },
      {
        title: 'Plans synced to an account',
        status: 'done',
        detail:
          'Signed in, saved plans follow you to every device; signed out, they stay on this one. A plan deleted on one device stays deleted on the others.',
      },
    ],
  },
  {
    id: 'awareness',
    title: 'Know before you go',
    goal: 'Surface conditions and hazards without inventing any of them.',
    items: [
      {
        title: 'Live weather',
        status: 'done',
        detail: 'Google Weather with an OpenWeather fallback, or an explicit "unavailable".',
      },
      {
        title: 'Advisory layer and scraper',
        status: 'partial',
        detail:
          'The layer, panel and scraper ship. No region is configured yet, so it correctly shows nothing.',
      },
      {
        title: 'Training plan',
        status: 'done',
        detail:
          'The readiness gap becomes a week-by-week progression at 10% per week, so the answer is "not yet, six weeks" rather than just "not yet".',
      },
      {
        title: 'Readiness score',
        status: 'done',
        detail:
          'Routes are scored against the last eight weeks of training, gated by the limiting factor so the answer names what to train.',
      },
      {
        title: 'An assistant that checks before it answers',
        status: 'done',
        detail:
          'Ask about the place you have open and the assistant reads its real length, climb and forecast instead of guessing. It can offer to save the place; you press Save.',
      },
      {
        title: 'A weather window, not just conditions',
        status: 'done',
        detail:
          'The forecast now answers when to go: the soonest span long enough for the route, scoped to its length rather than to the map pin.',
      },
    ],
  },
  {
    id: 'record',
    title: 'Make the effort add up',
    goal: 'Reward the person who keeps going, and point them at what is next.',
    items: [
      {
        title: 'Routes you are ready for',
        status: 'done',
        detail:
          'Readiness asked the other way round: the biggest route you can finish now, and the stretch band just beyond it, above the list.',
      },
      {
        title: 'A record that accumulates',
        status: 'done',
        detail:
          'Year-to-date distance and climb, lifetime totals, personal bests, and lifetime ascent expressed in Everests.',
      },
      {
        title: 'Installable on a phone',
        status: 'partial',
        detail:
          'A manifest, icons and standalone display make it installable. It still needs the network — offline support is scoped to a Trip, which does not exist yet.',
      },
      {
        title: 'Trip, check-in and the safety timer',
        status: 'pending',
        detail:
          'The decided spine (ADR-0003): a trip you can file, an expected return, and a server that tells your contact if you do not check in. Not started.',
      },
    ],
  },
];

export interface RoadmapNote {
  title: string;
  body: string;
}

export const CONSIDERATIONS: RoadmapNote[] = [
  {
    title: 'Nothing invented, ever',
    body: 'Where data is missing the UI says so. That is why difficulty can read "Unrated", cost shows no total, and the advisory panel says "no source connected" rather than "all clear".',
  },
  {
    title: 'One primary action per screen',
    body: 'The button vocabulary allows a single primary treatment per viewport. Repeated calls to action are demoted rather than duplicated.',
  },
  {
    title: 'Device-first storage',
    body: 'Plans, filters, viewport and imported activities live on the device, so the app is useful before signing in and nothing is lost at the sign-in step.',
  },
];

export const CHALLENGES: RoadmapNote[] = [
  {
    title: 'Few routes are tagged with their climb',
    body: 'OpenStreetMap gives every route a measured length, but only some carry an ascent tag, and difficulty needs both. So the climb is measured from terrain along the route when you open it; the list still rates only routes that carry the tag.',
  },
  {
    title: 'Free services are shared',
    body: 'Waymarked Trails, Photon and OpenTopoData are run for everyone. Discovery is cached at the edge for a week per 0.1° cell so each region costs them one visit, not one per visitor.',
  },
  {
    title: 'Advisories have no standard',
    body: 'Every authority publishes differently. The scraper is declarative per source, so each new region is configuration plus verification, not code.',
  },
  {
    title: 'Cold regions are slow, not costly',
    body: 'A new area takes a few seconds of upstream lookups the first time anyone opens it, and is then served from the edge. Nothing in discovery is billed per call any more.',
  },
];

export const RECOMMENDATIONS: RoadmapNote[] = [
  {
    title: 'Measure the climb along each route',
    body: 'Routes now arrive with a measured length. Sampling terrain along their mapped geometry would give the climb as well, and with it a difficulty and readiness score for every route rather than the few tagged with one.',
  },
  {
    title: 'Instrument before optimising',
    body: 'The efficiency panel describes the request budget rather than measuring it. A metrics sink would turn cost work from guesswork into evidence.',
  },
  {
    title: 'Connect one advisory region',
    body: 'The pipeline is built. One configured source proves it end to end and makes the layer worth switching on.',
  },
];
