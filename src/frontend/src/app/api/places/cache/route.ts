import { NextRequest, NextResponse } from 'next/server';
import { createLogger, serializeError } from '@/lib/logger';
import { getFirestoreAdmin, isFirebaseAdminConfigured } from '@/lib/firebaseAdmin';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { PLACES_CACHE_READ_RATE_LIMIT, PLACES_CACHE_WRITE_RATE_LIMIT } from '@/lib/rateLimitRules';
import { requireUser } from '@/lib/serverAuth';
import {
  PLACES_CACHE_VERSION,
  parseCampsite,
  parseList,
  parseMountain,
  parseRoute,
} from '@/lib/placesCacheSchema';

export const runtime = 'nodejs';

/**
 * Shared Places cache — Firestore collection: places_cache
 *
 * Grid key: lat/lng rounded to 0.5-degree (~55 km) cells so that all users
 * within a region share the same cached result set.
 *
 * TTL: 24 hours. After that the client falls through to live API calls.
 *
 * Entries carry `expiresAt` so a Firestore TTL policy (firestore.indexes.json)
 * deletes them. Freshness used to be checked only on read, which kept stale
 * cells from being served but never removed one — the collection grew by a
 * document for every half-degree cell anyone ever opened the map in.
 */
const CACHE_TTL_HOURS = 24;
const CACHE_TTL_MS = CACHE_TTL_HOURS * 3_600_000;
const COLLECTION = 'places_cache';

/**
 * A real point on the globe.
 *
 * `gridKey` rounds and interpolates these into a Firestore document id, so a
 * NaN or an out-of-range value would mint a nonsense cell that no reader ever
 * hits — a slow leak of junk documents rather than a visible failure.
 */
function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function gridKey(lat: number, lng: number): string {
  const gLat = Math.round(lat * 2) / 2;
  const gLng = Math.round(lng * 2) / 2;
  return `${gLat}_${gLng}`;
}

/**
 * GET /api/places/cache?lat=<lat>&lng=<lng>
 * Returns cached routes/mountains/campsites if fresh, otherwise 404.
 */
export async function GET(request: NextRequest) {
  const log = createLogger('/api/places/cache', request);
  // Public and cheap per call, but the grid is enumerable: 0.5° cells over a
  // country is a few thousand requests, and without a ceiling our shared cache
  // is a free bulk export of the Places data we paid to assemble.
  // Explicitly anonymous (`null`): reads never authenticate, so the budget is
  // per IP. Only the POST below has a verified caller to charge.
  const limit = await rateLimit(request, PLACES_CACHE_READ_RATE_LIMIT, null);
  if (!limit.ok) return tooManyRequests(limit);

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');

  // Not just NaN: `parseFloat('Infinity')` is a number, and would look up a
  // cell called "Infinity_0" on every such request.
  if (!isValidCoordinate(lat, lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  // A miss, not a failure: without Firebase there is simply no shared cache,
  // and the caller does exactly what it does for any miss — fetch live.
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ hit: false, reason: 'not_configured' }, { status: 404 });
  }

  try {
    const db = getFirestoreAdmin();
    const doc = await db.collection(COLLECTION).doc(gridKey(lat, lng)).get();

    if (!doc.exists) {
      return NextResponse.json({ hit: false }, { status: 404 });
    }

    const data = doc.data()!;
    const ageHours = (Date.now() - new Date(data.ts as string).getTime()) / 3_600_000;

    if (ageHours > CACHE_TTL_HOURS) {
      return NextResponse.json({ hit: false }, { status: 404 });
    }

    return NextResponse.json({
      hit: true,
      // Schema version travels with the payload so the client can reject an
      // entry written before a field changed meaning.
      v: data.v ?? 1,
      routes: data.routes,
      mountains: data.mountains,
      campsites: data.campsites,
      // No `location`. Entries used to carry the writer's own position and
      // reverse-geocoded address, returned here to anyone who asked about the
      // cell — and no client ever read it back.
      ts: data.ts,
    });
  } catch (err) {
    // Firestore unavailable — caller falls back to live fetch
    log.warn('places_cache_read_failed', { error: serializeError(err) });
    return NextResponse.json({ hit: false }, { status: 404 });
  }
}

/**
 * POST /api/places/cache
 * Header: `Authorization: Bearer <firebaseIdToken>`
 * Body: { v, lat, lng, routes, mountains, campsites }
 * Writes to Firestore. Called after a successful live fetch.
 *
 * Signed-in callers only. `places_cache` is world-readable and shared by every
 * user within a 55 km cell for 24 hours, so an open write endpoint let anyone
 * hand-deliver invented trails, elevations and campsites to a whole region —
 * exactly the fabricated data the rest of this codebase refuses to render.
 * Requiring a token does not make a caller trustworthy, but it makes them
 * identifiable and revocable, and it takes the attack off the open internet.
 *
 * Anonymous visitors still *read* the cache; they simply no longer fill it.
 *
 * Every item is rebuilt through `lib/placesCacheSchema.ts`, so only fields the
 * app writes, with plausible values, are stored. And while a cell is fresh only
 * the account that filled it may refresh it (409 for anyone else): the old
 * unconditional `set` let any account overwrite any region at will, and one
 * account could rewrite dozens of cells an hour.
 */
export async function POST(request: NextRequest) {
  const log = createLogger('/api/places/cache', request);
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  // Identity makes a poisoner revocable; the limit bounds how much one
  // authenticated account can rewrite before anyone notices.
  const limit = await rateLimit(request, PLACES_CACHE_WRITE_RATE_LIMIT, auth.user);
  if (!limit.ok) return tooManyRequests(limit);

  let body: {
    v?: unknown;
    lat: unknown;
    lng: unknown;
    routes: unknown;
    mountains: unknown;
    campsites: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { v, lat, lng } = body;

  if (!isValidCoordinate(lat, lng)) {
    return NextResponse.json(
      { error: 'lat and lng must be finite numbers within valid coordinate ranges' },
      { status: 400 }
    );
  }

  if (v !== PLACES_CACHE_VERSION) {
    return NextResponse.json({ error: 'Unsupported cache version' }, { status: 400 });
  }

  const routes = parseList(body.routes, parseRoute);
  const mountains = parseList(body.mountains, parseMountain);
  const campsites = parseList(body.campsites, parseCampsite);

  if (!routes || !mountains || !campsites) {
    return NextResponse.json(
      {
        error:
          'routes, mountains and campsites must each be an array of at most 200 well-formed places',
      },
      { status: 400 }
    );
  }

  // Writing the shared cache is best-effort and purely a cost optimisation: the
  // caller already has its results and does not need this to have worked. On a
  // clone without Firebase this used to throw and return 500, so every single
  // page load logged a red Internal Server Error for a feature that was merely
  // switched off. Say it did not happen, and say why, without calling it a fault.
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ ok: false, reason: 'not_configured' });
  }

  try {
    const db = getFirestoreAdmin();
    // `isValidCoordinate` checked both; its type guard can only narrow one.
    const ref = db.collection(COLLECTION).doc(gridKey(lat, lng as number));
    const uid = auth.user.uid;

    const outcome = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const current = existing.data();
      const fresh =
        existing.exists && Date.now() - new Date(current?.ts as string).getTime() < CACHE_TTL_MS;

      // First writer wins while the entry is fresh. Honest clients only write
      // after a miss, so a refusal here costs a legitimate user nothing.
      if (fresh && current?.written_by !== uid) return 'held' as const;

      const now = Date.now();
      tx.set(ref, {
        v,
        routes,
        mountains,
        campsites,
        ts: new Date(now).toISOString(),
        expiresAt: new Date(now + CACHE_TTL_MS),
        // Who filled this cell, so a poisoned region can be traced to an
        // account and that account cut off. Erased with the account — see
        // USER_ATTRIBUTED_DOCUMENTS in lib/userDataFootprint.ts.
        written_by: uid,
      });
      return 'written' as const;
    });

    if (outcome === 'held') {
      return NextResponse.json({ ok: false, reason: 'fresh_entry_exists' }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Configured but the write failed — that is worth surfacing, unlike the
    // not-configured case above. 503 rather than 500: the handler is fine, the
    // dependency is not. The caller ignores it either way.
    log.warn('places_cache_write_failed', { error: serializeError(err) });
    return NextResponse.json({ ok: false, reason: 'write_failed' }, { status: 503 });
  }
}
