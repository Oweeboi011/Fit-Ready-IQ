import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

/**
 * Erasure is irreversible, so what matters is order and what it leaves behind.
 * Every Firestore touch is recorded in `calls` so a test can read the sequence.
 */

const calls: string[] = [];
const state = { failOn: null as string | null };

function step(name: string) {
  calls.push(name);
  if (state.failOn === name) throw new Error(`boom at ${name}`);
}

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ ok: true, user: { uid: 'alice', email: null } }),
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

vi.mock('@/lib/auditLog', () => ({ recordAudit: vi.fn(async () => undefined) }));

vi.mock('@/lib/stravaTokens', () => ({
  revokeStravaGrant: vi.fn(async () => step('revoke_strava')),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ deleteUser: async () => step('delete_auth') }),
}));

vi.mock('@/lib/firebaseAdmin', () => {
  const emptyQuery = { get: async () => ({ docs: [], size: 0 }) };
  return {
    isFirebaseAdminConfigured: () => true,
    getFirebaseAdminApp: () => ({}),
    getFirestoreAdmin: () => ({
      collection: (name: string) => ({
        doc: (id: string) => ({
          path: `${name}/${id}`,
          delete: async () => step(`delete:${name}`),
        }),
        where: () => emptyQuery,
      }),
      recursiveDelete: async (ref: { path: string }) => step(`recursive:${ref.path}`),
      batch: () => ({ delete: () => undefined, commit: async () => undefined }),
    }),
  };
});

function post(body: unknown) {
  return POST(
    new Request('https://fitreadyiq.test/api/account/delete', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  calls.length = 0;
  state.failOn = null;
});

describe('POST /api/account/delete', () => {
  it('refuses without the explicit confirmation', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('revokes Strava and deletes the tokens before erasing the user tree', async () => {
    // A sync already running writes only while the tokens exist. If the tree
    // went first, that sync could write activities back into it.
    const res = await post({ confirm: 'DELETE' });
    expect(res.status).toBe(200);

    const revoke = calls.indexOf('revoke_strava');
    const tokens = calls.indexOf('delete:strava_tokens');
    const tree = calls.indexOf('recursive:users/alice');
    expect(revoke).toBeGreaterThanOrEqual(0);
    expect(revoke).toBeLessThan(tree);
    expect(tokens).toBeLessThan(tree);
  });

  it('deletes the Auth account last', async () => {
    await post({ confirm: 'DELETE' });
    expect(calls.at(-1)).toBe('delete_auth');
  });

  it('keeps the account when a step fails, so the user can retry', async () => {
    state.failOn = 'recursive:users/alice';
    const res = await post({ confirm: 'DELETE' });

    expect(res.status).toBe(500);
    expect(calls).not.toContain('delete_auth');
    const body = (await res.json()) as { error: string };
    // It must not claim nothing was removed: the Strava steps already ran.
    expect(body.error).not.toMatch(/nothing further was removed/i);
  });
});
