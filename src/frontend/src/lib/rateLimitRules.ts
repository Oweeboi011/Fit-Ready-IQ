import type { RateLimitRule } from './rateLimit';

/**
 * Every rate-limit budget in the product, in one table.
 *
 * The limits used to live inline in the three routes that had them, which made
 * the interesting question — "which endpoints are unprotected?" — answerable
 * only by reading all fourteen route files. Four of the unprotected ones spend
 * money or third-party quota per call, and one of those (`/api/strava/sync`)
 * fans a single request out into ten Strava round trips and up to 300 Firestore
 * writes. A budget nobody can enumerate is a budget nobody reviews, so they are
 * enumerated here and imported by name.
 *
 * Every rule keys on `callerKey` from ./rateLimit: the bearer token when the
 * caller has one, the forwarded IP otherwise. Windows are one hour throughout,
 * because the thing being defended is a daily spend, not a burst.
 *
 * Adding a route? Add its budget here in the same change. A route with no entry
 * is a route with no ceiling.
 */

/**
 * Gemini inference, billed per call, on an endpoint with no sign-in. The limit
 * is the only thing between a script and the bill: generous for a person asking
 * about trails, useless for anyone farming free inference.
 */
export const CHAT_RATE_LIMIT: RateLimitRule = {
  name: 'chat',
  limit: 20,
  windowSeconds: 3600,
};

/** Google Weather / OpenWeather, billed per call. One lookup per place viewed. */
export const WEATHER_RATE_LIMIT: RateLimitRule = {
  name: 'weather',
  limit: 200,
  windowSeconds: 3600,
};

/** Google Routes, billed per call. The planner re-snaps on every waypoint edit. */
export const DIRECTIONS_RATE_LIMIT: RateLimitRule = {
  name: 'directions',
  limit: 120,
  windowSeconds: 3600,
};

/**
 * The OAuth code exchange. Deliberately the tightest budget in the table: a
 * person connects Strava once, and a caller hammering this is either probing
 * for a code that works or burning our Strava client's quota to lock the real
 * users out. Ten an hour is several honest retries and nothing else.
 */
export const STRAVA_EXCHANGE_RATE_LIMIT: RateLimitRule = {
  name: 'strava_exchange',
  limit: 10,
  windowSeconds: 3600,
};

/**
 * Reading or clearing the Strava connection.
 *
 * Cheap — one Firestore read — but the UI asks on every Connect Devices open, so
 * the ceiling is set for a person opening that panel repeatedly rather than for
 * one visit.
 *
 * There is no `strava_refresh` budget any more: refreshing is internal to
 * `lib/stravaTokens.ts`, reached only through the routes that already have their
 * own limits, so a client cannot drive it directly.
 */
export const STRAVA_CONNECTION_RATE_LIMIT: RateLimitRule = {
  name: 'strava_connection',
  limit: 60,
  windowSeconds: 3600,
};

/**
 * The activities proxy. Ten pages per sync, and the client re-syncs on mount,
 * so an active session across a few tabs can legitimately reach three figures.
 */
export const STRAVA_ACTIVITIES_RATE_LIMIT: RateLimitRule = {
  name: 'strava_activities',
  limit: 200,
  windowSeconds: 3600,
};

/**
 * The historical backfill. One call is ten Strava requests and up to 300
 * Firestore writes, and the client already self-limits to once an hour — so
 * anything past a few an hour is a retry loop or an attack, and either way the
 * amplification makes this the most expensive endpoint we serve.
 */
export const STRAVA_SYNC_RATE_LIMIT: RateLimitRule = {
  name: 'strava_sync',
  limit: 6,
  windowSeconds: 3600,
};

/**
 * The shared places cache. Public and Firestore-backed rather than paid, so the
 * ceiling is high — it exists to stop a scraper walking the 0.5° grid and
 * turning our read quota into their dataset.
 */
export const PLACES_CACHE_READ_RATE_LIMIT: RateLimitRule = {
  name: 'places_cache_read',
  limit: 300,
  windowSeconds: 3600,
};

/** Cache writes cost a Firestore write and are capped at 200 items per kind. */
export const PLACES_CACHE_WRITE_RATE_LIMIT: RateLimitRule = {
  name: 'places_cache_write',
  limit: 60,
  windowSeconds: 3600,
};

/** Advisories: a file read, or one upstream fetch. Cheap, but not free. */
export const ADVISORIES_RATE_LIMIT: RateLimitRule = {
  name: 'advisories',
  limit: 120,
  windowSeconds: 3600,
};

/**
 * Account export assembles every document a user owns. Rare by nature — a
 * handful a day is a person exercising their access right; more is a scrape.
 */
export const ACCOUNT_EXPORT_RATE_LIMIT: RateLimitRule = {
  name: 'account_export',
  limit: 5,
  windowSeconds: 3600,
};

/** Erasure is irreversible and needs one call. The budget is for failed retries. */
export const ACCOUNT_DELETE_RATE_LIMIT: RateLimitRule = {
  name: 'account_delete',
  limit: 5,
  windowSeconds: 3600,
};
