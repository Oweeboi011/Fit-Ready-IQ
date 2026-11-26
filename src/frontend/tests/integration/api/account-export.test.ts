import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/account/export/route';
import {
  RETAINED_ON_DELETE,
  USER_OWNED_COLLECTIONS,
  USER_OWNED_TREE_COLLECTIONS,
  USER_SUBCOLLECTIONS,
} from '@/lib/userDataFootprint';

/**
 * The export is a legal answer to "what do you hold about me", so the things
 * that matter are: it is only ever the caller's data, it walks the same
 * footprint erasure walks, and it never answers "nothing" when it could not look.
 */

const state = {
  signedIn: true,
  limited: false,
  configured: true,
  failWith: null as string | null,
};

const audits: Array<{ action: string; outcome: string; target?: string }> = [];
const queriedUids: string[] = [];

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () =>
    state.signedIn
      ? { ok: true, user: { uid: 'alice', email: 'alice@example.test' } }
      : { ok: false, response: new Response(null, { status: 401 }) },
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({
    ok: !state.limited,
    remaining: 0,
    retryAfterSeconds: 60,
  }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

vi.mock('@/lib/auditLog', () => ({
  recordAudit: async (
    _req: Request,
    entry: { action: string; outcome: string; target?: string }
  ) => {
    audits.push(entry);
  },
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    getUser: async (uid: string) => {
      if (state.failWith) throw new Error(state.failWith);
      return {
        uid,
        email: 'alice@example.test',
        displayName: 'Fixture Alice',
        photoURL: null,
        emailVerified: true,
        providerData: [{ providerId: 'google.com' }],
        metadata: { creationTime: 'Mon, 01 Jan 2026', lastSignInTime: 'Tue, 02 Jan 2026' },
      };
    },
  }),
}));

/** A document that behaves like a Firestore snapshot for the paths the route reads. */
function snap(rows: Array<{ id: string; data: Record<string, unknown>; messages?: unknown[] }>) {
  return {
    docs: rows.map((r) => ({
      id: r.id,
      data: () => r.data,
      ref: {
        collection: () => ({
          orderBy: () => ({
            get: async () => ({ docs: (r.messages ?? []).map((m) => ({ data: () => m })) }),
          }),
        }),
      },
    })),
  };
}

vi.mock('@/lib/firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => state.configured,
  getFirebaseAdminApp: () => ({}),
  getFirestoreAdmin: () => ({
    collection: (name: string) => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ strava_sync: { count: 3 } }) }),
        collection: (sub: string) => ({
          get: async () =>
            snap([
              {
                id: `${sub}-1`,
                data: {
                  name: 'Fixture Peak',
                  savedAt: { toDate: () => new Date('2026-02-03T04:05:06Z') },
                },
              },
            ]),
        }),
      }),
      where: (_field: string, _op: string, value: string) => {
        queriedUids.push(value);
        return {
          get: async () =>
            snap([
              {
                id: `${name}-1`,
                data: { user_id: value },
                messages: [{ role: 'user', content: 'hello' }],
              },
            ]),
        };
      },
    }),
  }),
}));

function get(url = 'https://fitreadyiq.test/api/account/export') {
  return GET(new Request(url, { headers: { authorization: 'Bearer token' } }));
}

beforeEach(() => {
  state.signedIn = true;
  state.limited = false;
  state.configured = true;
  state.failWith = null;
  audits.length = 0;
  queriedUids.length = 0;
});

describe('GET /api/account/export', () => {
  it('refuses a caller with no valid token', async () => {
    state.signedIn = false;
    const res = await get();
    expect(res.status).toBe(401);
    expect(audits).toEqual([]);
  });

  it('answers 429 when the caller is over budget', async () => {
    state.limited = true;
    expect((await get()).status).toBe(429);
  });

  it('never answers "nothing held" when the store is not configured', async () => {
    state.configured = false;
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty('data');
  });

  it('exports only the caller, ignoring a uid in the query', async () => {
    const res = await get('https://fitreadyiq.test/api/account/export?uid=bob');
    const body = await res.json();

    expect(body.uid).toBe('alice');
    expect(queriedUids.length).toBeGreaterThan(0);
    expect(queriedUids.every((u) => u === 'alice')).toBe(true);
  });

  it('walks every collection in the data footprint', async () => {
    const body = await (await get()).json();

    for (const name of [
      'account',
      'profile',
      ...USER_SUBCOLLECTIONS,
      ...USER_OWNED_COLLECTIONS,
      ...USER_OWNED_TREE_COLLECTIONS,
    ]) {
      expect(body.data, `${name} missing from export`).toHaveProperty(name);
    }
  });

  it('includes the words of a chat, not just its metadata', async () => {
    const body = await (await get()).json();
    const tree = USER_OWNED_TREE_COLLECTIONS[0];
    expect(body.data[tree][0].messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('writes timestamps as ISO strings', async () => {
    const body = await (await get()).json();
    const sub = USER_SUBCOLLECTIONS[0];
    expect(body.data[sub][0].savedAt).toBe('2026-02-03T04:05:06.000Z');
  });

  it('says what it does not include, and is never cached', async () => {
    const res = await get();
    const body = await res.json();

    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(body.notes.notIncluded).toEqual(RETAINED_ON_DELETE);
    expect(audits).toEqual([
      expect.objectContaining({ action: 'account.export', outcome: 'success' }),
    ]);
  });

  it('reports a failed assembly honestly and audits the failure', async () => {
    state.failWith = 'auth down';
    const res = await get();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not assemble your export.' });
    expect(audits).toEqual([
      expect.objectContaining({ action: 'account.export', outcome: 'failure' }),
    ]);
  });
});
