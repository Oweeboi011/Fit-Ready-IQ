import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

import { SWEEP_TARGETS, sweepExpired } from './expirySweep';

/**
 * An in-memory stand-in for the slice of Firestore the sweep touches:
 * `collection` / `collectionGroup` → `where('expiresAt', '<=', now)` →
 * `select()` → `limit(n)` → `get()`, and a write batch that deletes.
 */
interface FakeDoc {
  id: string;
  expiresAt?: Date;
}

function fakeDb(
  data: Record<string, FakeDoc[]>,
  opts: { failGroup?: boolean; onQuery?: () => void } = {}
) {
  const stores = new Map(Object.entries(data).map(([k, v]) => [k, [...v]]));
  const queries: Array<{ name: string; group: boolean; op: string; limit: number }> = [];

  function source(name: string, group: boolean) {
    return {
      where(field: string, op: string, value: Date) {
        expect(field).toBe('expiresAt');
        return {
          select: () => ({
            limit: (limit: number) => ({
              async get() {
                opts.onQuery?.();
                queries.push({ name, group, op, limit });
                if (group && opts.failGroup) {
                  throw new Error('FAILED_PRECONDITION: The query requires an index');
                }
                const docs = (stores.get(name) ?? [])
                  .filter((d) => d.expiresAt && d.expiresAt <= value)
                  .slice(0, limit)
                  .map((d) => ({ ref: { name, id: d.id } }));
                return { empty: docs.length === 0, size: docs.length, docs };
              },
            }),
          }),
        };
      },
    };
  }

  const db = {
    collection: (name: string) => source(name, false),
    collectionGroup: (name: string) => source(name, true),
    batch() {
      const pending: Array<{ name: string; id: string }> = [];
      return {
        delete: (ref: { name: string; id: string }) => pending.push(ref),
        async commit() {
          for (const ref of pending) {
            stores.set(
              ref.name,
              (stores.get(ref.name) ?? []).filter((d) => d.id !== ref.id)
            );
          }
        },
      };
    },
  };

  return { db: db as unknown as Firestore, stores, queries };
}

const NOW = new Date('2026-11-05T19:00:00Z');
const PAST = new Date('2026-11-01T00:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');

function docs(prefix: string, n: number, expiresAt?: Date): FakeDoc[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, expiresAt }));
}

describe('sweepExpired', () => {
  it('deletes what has expired and keeps what has not, or carries no expiry at all', async () => {
    const { db, stores } = fakeDb({
      rate_limits: [...docs('old', 3, PAST), ...docs('live', 2, FUTURE)],
      audit_logs: [{ id: 'legacy' }],
    });

    const result = await sweepExpired(db, { now: NOW });

    expect(result.deleted.rate_limits).toBe(3);
    expect(stores.get('rate_limits')!.map((d) => d.id)).toEqual(['live0', 'live1']);
    expect(stores.get('audit_logs')).toHaveLength(1);
    expect(result).toMatchObject({ complete: true, failed: {} });
  });

  it('treats a document expiring at exactly now as expired', async () => {
    const { db, stores, queries } = fakeDb({ places_cache: docs('p', 1, NOW) });
    await sweepExpired(db, { now: NOW });
    expect(stores.get('places_cache')).toHaveLength(0);
    expect(queries.every((q) => q.op === '<=')).toBe(true);
  });

  it('reaches every messages subcollection through a collection-group query', async () => {
    const { db, queries } = fakeDb({ messages: docs('m', 2, PAST) });
    const result = await sweepExpired(db, { now: NOW });
    expect(result.deleted.messages).toBe(2);
    expect(queries.find((q) => q.name === 'messages')?.group).toBe(true);
    expect(queries.find((q) => q.name === 'chat_sessions')?.group).toBe(false);
  });

  it('pages through a backlog larger than one batch', async () => {
    const { db, stores } = fakeDb({ rate_limits: docs('r', 1000, PAST) });
    const result = await sweepExpired(db, { now: NOW });
    expect(result.deleted.rate_limits).toBe(1000);
    expect(stores.get('rate_limits')).toHaveLength(0);
    expect(result.complete).toBe(true);
  });

  it('never deletes past its budget, and says the job is unfinished', async () => {
    const { db, stores, queries } = fakeDb({
      messages: docs('m', 300, PAST),
      rate_limits: docs('r', 300, PAST),
    });

    const result = await sweepExpired(db, { now: NOW, budget: 500 });

    const total = Object.values(result.deleted).reduce((a, b) => a + b, 0);
    expect(total).toBe(500);
    expect(stores.get('rate_limits')).toHaveLength(100);
    expect(result.complete).toBe(false);
    // No query ever asks for more than the budget has left.
    expect(queries.every((q) => q.limit <= 500)).toBe(true);
  });

  it('spends the budget on transcripts before counters', async () => {
    const { db, stores } = fakeDb({
      messages: docs('m', 50, PAST),
      rate_limits: docs('r', 50, PAST),
    });
    await sweepExpired(db, { now: NOW, budget: 50 });
    expect(stores.get('messages')).toHaveLength(0);
    expect(stores.get('rate_limits')).toHaveLength(50);
  });

  it('starts no new batch after the deadline', async () => {
    let t = 0;
    const { db, queries } = fakeDb(
      { messages: docs('m', 1000, PAST) },
      { onQuery: () => (t += 10) }
    );
    const result = await sweepExpired(db, { now: NOW, deadline: 15, clock: () => t });
    expect(queries).toHaveLength(2);
    expect(result.complete).toBe(false);
  });

  it('keeps sweeping the other collections when one query fails', async () => {
    const { db, stores } = fakeDb(
      { messages: docs('m', 2, PAST), rate_limits: docs('r', 2, PAST) },
      { failGroup: true }
    );

    const result = await sweepExpired(db, { now: NOW });

    expect(result.failed.messages).toMatch(/FAILED_PRECONDITION/);
    expect(stores.get('rate_limits')).toHaveLength(0);
    expect(result.complete).toBe(false);
  });

  it('covers every collection that carries an expiresAt', () => {
    // CLAUDE.md and the privacy page promise these expire; a target dropped
    // from the list is data kept past what the product says it keeps.
    expect(SWEEP_TARGETS.map((t) => t.name).sort()).toEqual(
      ['audit_logs', 'chat_sessions', 'messages', 'places_cache', 'rate_limits'].sort()
    );
  });
});
