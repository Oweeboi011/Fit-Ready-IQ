import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/integrations/firebase/route';

/**
 * The probe really writes to Firestore, so the thing to hold is that nobody but
 * an admin can trigger that write, and that a failed write is reported without
 * the Admin SDK's own message reaching the response.
 */

const state = {
  admin: true,
  connected: true,
  writeError: null as string | null,
};
const writes: Array<{ path: string; data: Record<string, unknown>; options: unknown }> = [];

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: async () =>
    state.admin
      ? { ok: true, admin: { uid: 'root', email: 'root@example.test' } }
      : { ok: false, response: new Response(null, { status: 403 }) },
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  getFirebaseConnectionStatus: () =>
    state.connected
      ? { connected: true, projectId: 'fixture-project' }
      : { connected: false, error: 'no credentials' },
  getFirestoreAdmin: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>, options: unknown) => {
          if (state.writeError) throw new Error(state.writeError);
          writes.push({ path: `${name}/${id}`, data, options });
        },
      }),
    }),
  }),
}));

const get = () => GET(new Request('https://fitreadyiq.test/api/integrations/firebase'));

beforeEach(() => {
  state.admin = true;
  state.connected = true;
  state.writeError = null;
  writes.length = 0;
});

describe('GET /api/integrations/firebase', () => {
  it('writes nothing for a caller who is not an admin', async () => {
    state.admin = false;
    expect((await get()).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it('reports 503 and does not attempt a write when credentials are missing', async () => {
    state.connected = false;
    const res = await get();
    expect(res.status).toBe(503);
    expect((await res.json()).connected).toBe(false);
    expect(writes).toEqual([]);
  });

  it('proves the round trip with one merge write to the health collection', async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connected: true, firestoreWrite: true });
    expect(writes).toEqual([
      expect.objectContaining({ path: '_health/chat-assistant', options: { merge: true } }),
    ]);
  });

  it('reports a failed write with a fixed reason, not the SDK message', async () => {
    state.writeError = 'PERMISSION_DENIED: project fixture-project private detail';
    const res = await get();
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({
      firestoreWrite: false,
      error: 'firestore_write_failed',
    });
    expect(text).not.toContain('PERMISSION_DENIED');
  });
});
