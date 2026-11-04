import type { Firestore, Query } from 'firebase-admin/firestore';

/**
 * Deletes documents whose `expiresAt` has passed — the job a Firestore TTL
 * policy would do, done by us because TTL needs the Blaze (billing) plan and the
 * project stays on Spark so it can never be charged.
 *
 * Run once a day by Vercel Cron (`/api/cron/expire`). Each deleted document
 * costs one read (the query) and one delete, both inside Spark's free daily
 * allowance — 50 000 reads and 20 000 deletes. Spark has no overage: past the
 * allowance Firestore refuses the operation rather than billing for it, so the
 * budget below exists to leave the product's own deletes room, not to bound a
 * bill.
 */

interface SweepTarget {
  /** A collection id, or a subcollection id when `group` is set. */
  readonly name: string;
  /**
   * Collection-group scope: every `messages` subcollection at once. Needs the
   * COLLECTION_GROUP index on `expiresAt` declared in `firestore.indexes.json`;
   * collection scope is indexed automatically.
   */
  readonly group?: boolean;
}

/**
 * Most sensitive first, so a backlog larger than the budget clears the
 * health-adjacent free text before the counters. `messages` precedes
 * `chat_sessions` because a session never expires before its own messages —
 * each turn refreshes both — so this order never strands a transcript.
 */
export const SWEEP_TARGETS: readonly SweepTarget[] = [
  { name: 'messages', group: true },
  { name: 'chat_sessions' },
  { name: 'audit_logs' },
  { name: 'places_cache' },
  { name: 'rate_limits' },
];

/**
 * Deletes per run. Half the free daily allowance: account erasure and cache
 * purges delete too, and must not find the day's quota already spent. A backlog
 * beyond this clears over the following days.
 */
const DAILY_DELETE_BUDGET = 10_000;

/** A write batch holds at most 500 operations; stay clear of the edge. */
const PAGE_SIZE = 400;

interface SweepOptions {
  now: Date;
  budget?: number;
  /** Epoch ms after which no new page is started, so the function never times out mid-batch. */
  deadline?: number;
  clock?: () => number;
}

export interface SweepResult {
  /** Documents deleted, per target. */
  deleted: Record<string, number>;
  /** Targets whose query or delete failed, with the reason. The others still ran. */
  failed: Record<string, string>;
  /** False when the budget or deadline stopped the sweep with expired documents left. */
  complete: boolean;
}

function expiredQuery(db: Firestore, target: SweepTarget, now: Date, limit: number): Query {
  const source = target.group ? db.collectionGroup(target.name) : db.collection(target.name);
  // `select()` with no fields returns references only: the read is billed the
  // same, but a cache entry of 200 places is not downloaded just to be deleted.
  return source.where('expiresAt', '<=', now).select().limit(limit);
}

export async function sweepExpired(db: Firestore, options: SweepOptions): Promise<SweepResult> {
  const { now, budget = DAILY_DELETE_BUDGET, deadline = Infinity, clock = Date.now } = options;
  const deleted: Record<string, number> = {};
  const failed: Record<string, string> = {};
  let remaining = budget;
  let complete = true;

  sweep: for (const target of SWEEP_TARGETS) {
    deleted[target.name] = 0;
    try {
      for (;;) {
        if (remaining <= 0 || clock() >= deadline) {
          // Stopped with expired documents possibly left. One more probe would
          // tell, but "maybe not" is the honest answer and costs nothing.
          complete = false;
          break sweep;
        }
        const limit = Math.min(PAGE_SIZE, remaining);
        const snapshot = await expiredQuery(db, target, now, limit).get();
        if (snapshot.empty) break;

        const batch = db.batch();
        for (const doc of snapshot.docs) batch.delete(doc.ref);
        await batch.commit();

        deleted[target.name] += snapshot.size;
        remaining -= snapshot.size;
        // A page shorter than asked for is the last one. Compare against what
        // was asked, not PAGE_SIZE: a page the budget cut short is not the end.
        if (snapshot.size < limit) break;
      }
    } catch (err) {
      // One target failing — typically `messages` before its collection-group
      // index is deployed (FAILED_PRECONDITION) — must not stop the others.
      failed[target.name] = err instanceof Error ? err.message : String(err);
      complete = false;
    }
  }

  return { deleted, failed, complete };
}
