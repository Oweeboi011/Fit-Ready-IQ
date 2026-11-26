import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as whoami } from '@/app/api/admin/whoami/route';
import { GET as stravaSync } from '@/app/api/admin/strava-sync/route';
import { GET as users } from '@/app/api/admin/users/route';

/**
 * Three read-only admin routes with three different bars: whoami answers anyone
 * and leaves no trace, strava-sync needs a viewer, users needs a full admin.
 * What these tests hold is that the bar is the one the route claims, that a
 * refusal stops the work, and that reading across users is recorded.
 */

type Role = 'viewer' | 'admin' | null;
const ORDER = { viewer: 1, admin: 2 } as const;

const state = {
  role: null as Role,
  limited: false,
  usersError: null as string | null,
  listed: [] as Array<Record<string, unknown>>,
  pageToken: undefined as string | undefined,
  userDocs: [] as Array<{ id: string; data: Record<string, unknown> }>,
};
const audits: Array<{ action: string; outcome: string; detail?: Record<string, unknown> }> = [];
const roleAsked: string[] = [];

function gate(required: 'viewer' | 'admin') {
  roleAsked.push(required);
  if (state.role && ORDER[state.role] >= ORDER[required]) {
    return { ok: true, admin: { uid: 'root', email: 'root@example.test', role: state.role } };
  }
  return { ok: false, response: new Response(null, { status: state.role ? 403 : 401 }) };
}

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: async () => gate('admin'),
  requireRole: async (_req: Request, required: 'viewer' | 'admin') => gate(required),
  currentRole: async () =>
    state.role ? { uid: 'u', email: 'u@example.test', role: state.role } : null,
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: !state.limited, remaining: 0, retryAfterSeconds: 30 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

vi.mock('@/lib/auditLog', () => ({
  recordAudit: async (_req: Request, entry: { action: string; outcome: string }) => {
    audits.push(entry);
  },
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    listUsers: async () => {
      if (state.usersError) throw new Error(state.usersError);
      return { users: state.listed, pageToken: state.pageToken };
    },
  }),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  getFirebaseAdminApp: () => ({}),
  getFirestoreAdmin: () => ({
    collection: () => ({
      get: async () => ({
        size: state.userDocs.length,
        docs: state.userDocs.map((d) => ({ id: d.id, data: () => d.data })),
      }),
    }),
  }),
}));

const req = (path: string) => new Request(`https://fitreadyiq.test${path}`);

beforeEach(() => {
  state.role = null;
  state.limited = false;
  state.usersError = null;
  state.listed = [];
  state.pageToken = undefined;
  state.userDocs = [];
  audits.length = 0;
  roleAsked.length = 0;
});

describe('GET /api/admin/whoami', () => {
  it('answers a stranger with 200 and no role, so the UI can hide quietly', async () => {
    const res = await whoami(req('/api/admin/whoami'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isAdmin: false, role: null });
  });

  it('does not treat a viewer as an admin', async () => {
    state.role = 'viewer';
    expect(await (await whoami(req('/api/admin/whoami'))).json()).toEqual({
      isAdmin: false,
      role: 'viewer',
    });
  });

  it('reports a full admin', async () => {
    state.role = 'admin';
    expect(await (await whoami(req('/api/admin/whoami'))).json()).toEqual({
      isAdmin: true,
      role: 'admin',
    });
  });

  it('is a question, not an attempt: it writes no audit entry', async () => {
    state.role = 'admin';
    await whoami(req('/api/admin/whoami'));
    expect(audits).toEqual([]);
  });

  it('is metered', async () => {
    state.limited = true;
    expect((await whoami(req('/api/admin/whoami'))).status).toBe(429);
  });
});

describe('GET /api/admin/users', () => {
  it.each([
    ['a stranger', null, 401],
    ['a viewer', 'viewer', 403],
  ] as const)('refuses %s and reads nothing', async (_who, role, status) => {
    state.role = role;
    const res = await users(req('/api/admin/users'));
    expect(res.status).toBe(status);
    expect(audits).toEqual([]);
  });

  it('lists accounts with a provider, ISO dates and "never" for a missing sign-in', async () => {
    state.role = 'admin';
    state.listed = [
      {
        uid: 'a1',
        email: 'a@example.test',
        displayName: 'Fixture A',
        providerData: [{ providerId: 'google.com' }],
        metadata: { creationTime: 'Mon, 01 Jan 2026 00:00:00 GMT', lastSignInTime: undefined },
      },
      { uid: 'b2', providerData: [], metadata: {} },
    ];

    const body = await (await users(req('/api/admin/users'))).json();

    expect(body.total).toBe(2);
    expect(body.users[0]).toMatchObject({
      uid: 'a1',
      provider: 'google',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSignIn: 'never',
    });
    expect(body.users[1]).toMatchObject({ email: '—', provider: 'unknown', createdAt: 'never' });
  });

  it('says so when the list was cut at one page, rather than cutting it silently', async () => {
    state.role = 'admin';
    state.pageToken = 'more';
    const body = await (await users(req('/api/admin/users'))).json();
    expect(body.truncated).toBe(true);
  });

  it('records the read, even though it is only a read', async () => {
    state.role = 'admin';
    await users(req('/api/admin/users'));
    expect(audits).toEqual([
      expect.objectContaining({ action: 'admin.users.read', outcome: 'success' }),
    ]);
  });

  it('fails with a generic error and audits the failure, without leaking the cause', async () => {
    state.role = 'admin';
    state.usersError = 'secret upstream detail';
    const res = await users(req('/api/admin/users'));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
    expect(audits).toEqual([
      expect.objectContaining({ action: 'admin.users.read', outcome: 'failure' }),
    ]);
  });
});

describe('GET /api/admin/strava-sync', () => {
  it('asks for the viewer role, not admin', async () => {
    state.role = 'viewer';
    const res = await stravaSync(req('/api/admin/strava-sync'));
    expect(res.status).toBe(200);
    expect(roleAsked).toEqual(['viewer']);
  });

  it('refuses a stranger', async () => {
    expect((await stravaSync(req('/api/admin/strava-sync'))).status).toBe(401);
    expect(audits).toEqual([]);
  });

  it('skips users who never synced and sorts the rest newest first, with never-synced last', async () => {
    state.role = 'viewer';
    state.userDocs = [
      { id: 'never', data: { strava_sync: { total_activities: 0 } } },
      { id: 'no-strava', data: {} },
      {
        id: 'old',
        data: { strava_sync: { last_synced_at: '2026-01-01T00:00:00Z', total_activities: 4 } },
      },
      {
        id: 'new',
        data: {
          strava_sync: {
            last_synced_at: '2026-03-01T00:00:00Z',
            total_activities: 9,
            errors: ['429'],
          },
        },
      },
    ];

    const body = await (await stravaSync(req('/api/admin/strava-sync'))).json();

    expect(body.entries.map((e: { uid: string }) => e.uid)).toEqual(['new', 'old', 'never']);
    expect(body.entries[0]).toMatchObject({ total_activities: 9, errors: ['429'] });
    expect(body.entries[2]).toMatchObject({ last_synced_at: null, errors: null });
  });

  it('records that it walked every user document', async () => {
    state.role = 'viewer';
    state.userDocs = [{ id: 'a', data: {} }];
    await stravaSync(req('/api/admin/strava-sync'));
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'admin.strava_sync.read',
        outcome: 'success',
        detail: { scanned: 1, returned: 0 },
      }),
    ]);
  });
});
