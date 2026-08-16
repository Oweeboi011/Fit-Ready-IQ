# Runbook: Firestore TTL policies

**Three collections will grow without bound until these policies exist.** The
application writes an `expiresAt` timestamp on each of them, but that field does
nothing on its own — Firestore only acts on it once a TTL policy names it. A
deployment without these policies is not broken in any way you will notice
quickly; it accumulates cost and, worse, retains data past the retention period
the product claims.

## The policies

| Collection | Field | Retention | Why it matters |
| --- | --- | --- | --- |
| `rate_limits` | `expiresAt` | ~2 windows (set by the writer) | One document per caller per window. Pure garbage after the window closes, and the highest-volume collection in the product. |
| `chat_sessions` | `expiresAt` | 90 days | Free-text conversation. In a fitness product this routinely contains health information. |
| `chat_sessions/{id}/messages` | `expiresAt` | 90 days | **Collection-group scope.** Deleting a parent document does *not* delete its subcollection, so without this the transcripts outlive the sessions permanently. |
| `audit_logs` | `expiresAt` | 730 days | Compliance evidence. Two years is the common floor for SOC 2 / ISO 27001 and covers the window for proving a GDPR erasure was honoured. |

## Creating them

Console: **Firestore → TTL → Create policy**, then give the collection ID and
`expiresAt`. For the messages policy, choose **collection group** scope and use
the collection group ID `messages`.

Or with gcloud:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=rate_limits --enable-ttl --project="$FIREBASE_PROJECT_ID"

gcloud firestore fields ttls update expiresAt \
  --collection-group=chat_sessions --enable-ttl --project="$FIREBASE_PROJECT_ID"

gcloud firestore fields ttls update expiresAt \
  --collection-group=messages --enable-ttl --project="$FIREBASE_PROJECT_ID"

gcloud firestore fields ttls update expiresAt \
  --collection-group=audit_logs --enable-ttl --project="$FIREBASE_PROJECT_ID"
```

## Verifying

```bash
gcloud firestore fields ttls list --project="$FIREBASE_PROJECT_ID"
```

Each should report state `ACTIVE`. A policy sits in `CREATING` for a few minutes
on first creation, and on an existing collection the initial sweep can take up
to 24 hours — deletions are not immediate and are not billed as user writes.

## Things worth knowing before you rely on this

- **TTL is best-effort within ~24 hours of the timestamp**, not punctual. Do not
  use it where an exact deletion deadline is a commitment; for the erasure path
  the product deletes documents directly, and TTL is only the backstop.
- **A policy applies only to documents that carry the field.** Anything written
  before the field was introduced never expires. For `chat_sessions` that is the
  known gap recorded in `src/lib/userDataFootprint.ts`; those documents have to
  be swept manually if the backlog matters.
- **Deleting a policy does not resurrect anything**, but re-creating one does not
  re-scan instantly either — expect another sweep window.
- Enabling TTL on a field that is not a timestamp silently matches nothing.
  Check the type if a policy is `ACTIVE` and nothing is being removed.
