import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * firestore.rules, exercised against the emulator.
 *
 * Rules are the one layer the Admin SDK routes never pass through, so nothing
 * else in the test suite can catch a mistake in them — and mistakes here have
 * already reached production twice: `saved_places` shipped with no match block
 * and silently denied every bookmark, and `places_cache` shipped world-readable.
 *
 * Run with `npm run test:rules` (starts the emulator; needs Java 11+).
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fit-ready-iq',
    firestore: {
      rules: readFileSync(
        path.join(__dirname, '..', '..', '..', '..', '..', 'firestore.rules'),
        'utf8'
      ),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();

/** Seeds data as the Admin SDK would, bypassing rules. */
async function seed(pathSegments: string[], data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), pathSegments.join('/')), data);
  });
}

/** Exactly what useSavedPlaces.ts writes for a peak. */
function bookmark(overrides: Record<string, unknown> = {}) {
  return {
    type: 'mountain',
    name: 'Mount Tamalpais',
    coordinates: [-122.596, 37.923],
    elevation_m: 784,
    mountain_type: 'peak',
    photos: [],
    place_id: 'ChIJ-example',
    savedAt: serverTimestamp(),
    ...overrides,
  };
}

describe('users/{uid}', () => {
  it('lets the owner read their user document', async () => {
    await seed(['users', 'alice'], { strava_sync: { synced: 3 } });
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  });

  it("refuses anyone else's user document", async () => {
    await seed(['users', 'alice'], { strava_sync: { synced: 3 } });
    await assertFails(getDoc(doc(bob(), 'users/alice')));
  });

  it('refuses owner writes, so the server-kept sync manifest cannot be forged', async () => {
    await seed(['users', 'alice'], { strava_sync: { synced: 3 } });
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { 'strava_sync.synced': 9999 }));
    await assertFails(setDoc(doc(alice(), 'users/alice'), { strava_sync: { errors: ['x'] } }));
  });
});

describe('users/{uid}/saved_places', () => {
  it('lets the owner save a well-formed bookmark', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark()));
  });

  it('accepts a route bookmark with an unknown length', async () => {
    await assertSucceeds(
      setDoc(
        doc(alice(), 'users/alice/saved_places/r1'),
        bookmark({
          type: 'route',
          elevation_m: null,
          distance_km: null,
          difficulty: 'unknown',
          activity_type: 'hike',
        })
      )
    );
  });

  it('lets the owner read and remove their bookmarks', async () => {
    await setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark());
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/saved_places')));
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/saved_places/p1')));
  });

  it("refuses to read or write someone else's bookmarks", async () => {
    await seed(['users', 'alice', 'saved_places', 'p1'], { type: 'route', name: 'x' });
    await assertFails(getDoc(doc(bob(), 'users/alice/saved_places/p1')));
    await assertFails(setDoc(doc(bob(), 'users/alice/saved_places/p2'), bookmark()));
  });

  it('refuses fields the app never writes', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark({ payload: 'x'.repeat(1000) }))
    );
  });

  it('refuses an unknown place type', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark({ type: 'bunker' }))
    );
  });

  it('refuses an oversized name', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark({ name: 'x'.repeat(201) }))
    );
  });

  it('refuses a client-chosen timestamp', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark({ savedAt: 0 }))
    );
  });

  it('refuses coordinates off the globe', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark({ coordinates: [200, 37.9] }))
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark({ coordinates: [-122.6, 95] }))
    );
  });

  it('refuses a photo list holding anything but bounded strings', async () => {
    await assertSucceeds(
      setDoc(
        doc(alice(), 'users/alice/saved_places/p1'),
        bookmark({ photos: ['https://example.com/a.jpg', 'https://example.com/b.jpg'] })
      )
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/saved_places/p2'), bookmark({ photos: [{ blob: 'x' }] }))
    );
    await assertFails(
      setDoc(
        doc(alice(), 'users/alice/saved_places/p3'),
        bookmark({ photos: ['ok', 'x'.repeat(5000)] })
      )
    );
  });

  it('refuses a rating outside 0–5', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/saved_places/p1'), bookmark({ rating: 50 }))
    );
  });

  it('refuses a missing required field', async () => {
    const { coordinates: _dropped, ...withoutCoordinates } = bookmark();
    await assertFails(setDoc(doc(alice(), 'users/alice/saved_places/p1'), withoutCoordinates));
  });
});

describe('users/{uid}/strava_activities', () => {
  it('is readable by the owner and writable by nobody', async () => {
    await seed(['users', 'alice', 'strava_activities', 'a1'], { name: 'Run' });
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/strava_activities/a1')));
    await assertFails(setDoc(doc(alice(), 'users/alice/strava_activities/a2'), { name: 'x' }));
  });
});

describe('places_cache', () => {
  it('is closed to clients, signed in or not — /api/places/cache is the way in', async () => {
    await seed(['places_cache', '37.5_-122.5'], { routes: [], written_by: 'alice' });
    await assertFails(getDoc(doc(anon(), 'places_cache/37.5_-122.5')));
    await assertFails(getDoc(doc(alice(), 'places_cache/37.5_-122.5')));
    await assertFails(getDocs(collection(anon(), 'places_cache')));
    await assertFails(setDoc(doc(alice(), 'places_cache/0_0'), { routes: [] }));
  });
});

describe('server-only collections', () => {
  it.each([
    'chat_sessions/s1',
    'chat_sessions/s1/messages/m1',
    'rate_limits/b1',
    'audit_logs/e1',
    'strava_tokens/alice',
    '_health/check',
  ])('%s is closed to its would-be owner', async (docPath) => {
    await seed(docPath.split('/'), { user_id: 'alice' });
    await assertFails(getDoc(doc(alice(), docPath)));
    await assertFails(setDoc(doc(alice(), docPath), { user_id: 'alice' }));
  });
});

describe('user_id-scoped collections', () => {
  it.each(['activities', 'training_programs', 'training_sessions', 'itineraries'])(
    '%s: the owner reads, nobody writes from a browser — the backend writes via the Admin SDK',
    async (name) => {
      await seed([name, 'd1'], { user_id: 'alice', v: 1 });
      await assertSucceeds(getDoc(doc(alice(), `${name}/d1`)));
      await assertFails(getDoc(doc(bob(), `${name}/d1`)));
      // Owner-writable, with no shape or size limit, these were storage any
      // signed-in account could fill at our expense.
      await assertFails(setDoc(doc(alice(), `${name}/d2`), { user_id: 'alice', v: 1 }));
      await assertFails(updateDoc(doc(alice(), `${name}/d1`), { v: 2 }));
      await assertFails(deleteDoc(doc(alice(), `${name}/d1`)));
    }
  );
});
