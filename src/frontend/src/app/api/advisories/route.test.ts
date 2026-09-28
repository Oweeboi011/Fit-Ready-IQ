import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

/**
 * Advisories are safety information. The failure that matters is the silent
 * one: a source we have but cannot read turning into "no advisories".
 */

const file = { contents: null as string | null, code: 'ENOENT' };

vi.mock('node:fs/promises', () => {
  const readFile = async () => {
    if (file.contents !== null) return file.contents;
    throw Object.assign(new Error('read failed'), { code: file.code });
  };
  return { readFile, default: { readFile } };
});

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

const get = () => GET(new Request('https://fitreadyiq.test/api/advisories'));

function advisory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    title: 'Trail closed',
    source: 'Park authority',
    publishedAt: new Date().toISOString(),
    kind: 'closure',
    ...overrides,
  };
}

beforeEach(() => {
  file.contents = null;
  file.code = 'ENOENT';
  delete process.env.ADVISORY_FEED_URL;
});

describe('GET /api/advisories', () => {
  it('says no source is connected when there is no file and no feed', async () => {
    const res = await get();
    expect(await res.json()).toEqual({ configured: false, advisories: [] });
  });

  it('reports a corrupt file as an error rather than as "no source"', async () => {
    file.contents = '{ not json';
    const res = await get();
    expect(res.status).toBe(502);
    const body = (await res.json()) as { configured: boolean; error?: string };
    expect(body.configured).toBe(true);
    expect(body.error).toBeTruthy();
  });

  it('reports an unreadable file as an error', async () => {
    file.code = 'EACCES';
    const res = await get();
    expect(res.status).toBe(502);
  });

  it('serves a readable file', async () => {
    file.contents = JSON.stringify([advisory()]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { advisories: unknown[] }).advisories).toHaveLength(1);
  });

  it('drops an advisory whose link is not https — it is opened with window.open', async () => {
    file.contents = JSON.stringify([
      advisory({ id: 'ok', url: 'https://parks.example/notice' }),
      advisory({ id: 'js', url: 'javascript:alert(1)' }),
      advisory({ id: 'http', url: 'http://parks.example/notice' }),
    ]);
    const res = await get();
    const ids = ((await res.json()) as { advisories: { id: string }[] }).advisories.map(
      (a) => a.id
    );
    expect(ids).toEqual(['ok']);
  });
});
