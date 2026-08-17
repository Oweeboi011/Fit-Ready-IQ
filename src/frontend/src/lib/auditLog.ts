import { getFirestoreAdmin, isFirebaseAdminConfigured } from './firebaseAdmin';
import { createLogger } from './logger';

/**
 * Append-only audit trail for privileged and irreversible actions.
 *
 * The admin console can purge the shared places cache and read every user's
 * sync status, and the account routes can erase a person's data permanently.
 * None of that left a trace: the only record was a `console.log` in Vercel's
 * function output, which rolls off and cannot be queried. "Who purged the cache
 * on the 14th?" had no answer, and neither did "did we actually honour that
 * deletion request?" — which is the one an auditor asks.
 *
 * What goes in a record is deliberately narrow: who, what, which target, and
 * whether it worked. Never the payload. An audit log that quotes the data it is
 * describing becomes a second copy of that data, outliving the deletion it was
 * written to prove — so a deletion record names the uid and counts the
 * documents, and holds none of their contents.
 *
 * Retention is enforced by a Firestore TTL policy on `expiresAt` (see
 * AUDIT_RETENTION_DAYS). Writes are Admin-SDK only and the collection denies
 * all client access in firestore.rules; there is no update or delete path in
 * this module, which is what makes it append-only in practice.
 */

const COLLECTION = 'audit_logs';

/**
 * How long a record lives. Two years is the common floor for SOC 2 and ISO
 * 27001 evidence, and comfortably covers the statutory windows for proving a
 * GDPR erasure request was honoured.
 */
export const AUDIT_RETENTION_DAYS = 730;

/**
 * The actions worth a permanent record: privileged reads, destructive writes,
 * and anything a regulator or customer may later ask us to prove.
 *
 * A closed union rather than a free string so the set stays enumerable — an
 * audit trail you cannot list the possible entries of is one you cannot write
 * an alert against.
 */
export type AuditAction =
  | 'admin.cache.read'
  | 'admin.cache.purge'
  | 'admin.strava_sync.read'
  | 'admin.users.read'
  | 'admin.firebase_probe'
  | 'admin.access_denied'
  | 'account.export'
  | 'account.delete'
  | 'strava.disconnect';

export interface AuditActor {
  uid: string;
  email: string | null;
}

export interface AuditEntry {
  action: AuditAction;
  actor: AuditActor;
  /** What was acted on — a grid key, a uid, a collection name. Never a payload. */
  target?: string;
  /** Whether the action completed. Failed attempts matter as much as successes. */
  outcome: 'success' | 'failure';
  /** Small, non-sensitive counters: how many documents, which reason. */
  detail?: Record<string, string | number | boolean | null>;
}

/**
 * Best-effort client IP, for correlating a session with an access record.
 *
 * Spoofable off-Vercel, which is why it is recorded alongside the verified uid
 * rather than instead of it: the uid is the identity, this is a lead.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim() || null;
}

/**
 * Writes one record.
 *
 * Never throws and never rejects. An audit sink that can fail a request turns a
 * Firestore hiccup into an outage of the admin console, and the console is what
 * you reach for *during* an incident. The tradeoff is real and deliberate: a
 * dropped record is logged loudly to stderr so the gap is discoverable, rather
 * than silently swallowed.
 *
 * Callers do not await this on the success path of a read — the record matters,
 * the latency does not — but the promise is returned so tests can settle it.
 */
export async function recordAudit(request: Request, entry: AuditEntry): Promise<void> {
  const line = {
    ...entry,
    at: new Date().toISOString(),
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent')?.slice(0, 256) ?? null,
  };

  const log = createLogger('lib/auditLog', request);

  /**
   * The record, flattened for the log line.
   *
   * Flat rather than nested because these fields exist to be filtered on —
   * `actor_uid:"…"` is a query, `actor:{uid:…}` is a document. The Firestore
   * record keeps its nested shape; only the log view is flattened.
   *
   * `userAgent` is deliberately dropped here: it is worth storing next to an
   * audit record, and worth nothing in a log line it would dominate.
   */
  const fields = {
    action: line.action,
    actor_uid: line.actor.uid,
    actor_email: line.actor.email,
    target: line.target ?? null,
    outcome: line.outcome,
    ...(line.detail ?? {}),
  };

  if (!isFirebaseAdminConfigured()) {
    // No Firestore on a fresh clone. Still emit it, so local runs show the
    // trail and a misconfigured production deploy is not silently unaudited.
    log.warn('audit_not_persisted', { reason: 'firestore_not_configured', ...fields });
    return;
  }

  try {
    const expiresAt = new Date(Date.now() + AUDIT_RETENTION_DAYS * 86_400_000);
    await getFirestoreAdmin()
      .collection(COLLECTION)
      .add({ ...line, expiresAt });
  } catch (err) {
    log.error('audit_persist_failed', err, fields);
  }
}
