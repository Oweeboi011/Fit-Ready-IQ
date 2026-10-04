import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from '@/app/api/admin/cache/route';

/**
 * The purge endpoint can empty a cache every visitor depends on. What matters
 * is that wiping everything is only ever what the caller explicitly asked for.
 */

const state = { singleDeletes: [] as string[], fullScan: false };

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: async () => ({ ok: true, admin: { uid: 'root', email: 'root@x.test' } }),
  requireRole: async () => ({ ok: true, admin: { uid: 'root', email: 'root@x.test' } }),
}));

vi.mock('@/lib/auditLog', () => ({ recordAudit: vi.fn(async () => undefined) }));

vi.mock('@/lib/firebaseAdmin', () => ({
  getFirestoreAdmin: () => ({
    collection: () => ({
      doc: (id: string) => ({
        delete: async () => {
          state.singleDeletes.push(id);
        },
      }),
      get: async () => {
        state.fullScan = true;
        return { docs: [] };
      },
    }),
    batch: () => ({ delete: () => undefined, commit: async () => undefined }),
  }),
}));

function del(query: string, body?: unknown) {
  return DELETE(
    new Request(`https://fitreadyiq.test/api/admin/cache${query}`, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  state.singleDeletes = [];
  state.fullScan = false;
});

describe('DELETE /api/admin/cache', () => {
  it('refuses a request that names nothing, rather than purging everything', async () => {
    const res = await del('');
    expect(res.status).toBe(400);
    expect(state.fullScan).toBe(false);
  });

  it('refuses an empty gridKey — the blank-variable case that used to wipe the cache', async () => {
    const res = await del('?gridKey=');
    expect(res.status).toBe(400);
    expect(state.fullScan).toBe(false);
    expect(state.singleDeletes).toEqual([]);
  });

  it('refuses ?all=true without the confirmation body', async () => {
    const res = await del('?all=true');
    expect(res.status).toBe(400);
    expect(state.fullScan).toBe(false);
  });

  it('purges everything when asked for twice', async () => {
    const res = await del('?all=true', { confirm: 'PURGE' });
    expect(res.status).toBe(200);
    expect(state.fullScan).toBe(true);
  });

  it('deletes one named entry', async () => {
    const res = await del('?gridKey=37.5_-122.5');
    expect(res.status).toBe(200);
    expect(state.singleDeletes).toEqual(['37.5_-122.5']);
    expect(state.fullScan).toBe(false);
  });
});
