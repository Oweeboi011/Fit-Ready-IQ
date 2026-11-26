# Runbook: the expiry sweep

**Five collections carry an `expiresAt` timestamp, and the field does nothing
on its own.** Firestore's built-in TTL policies would act on it, but they need
the Blaze (billing) plan. The project stays on Spark so it can never be
charged, and a daily job does the deleting instead.

| Collection                    | Retention                       | Why it matters                                                                                                   |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `chat_sessions/{id}/messages` | 90 days                         | Free-text conversation, routinely health information. Deleting a session never deletes its subcollection.        |
| `chat_sessions`               | 90 days from the last turn      | The session record itself.                                                                                       |
| `audit_logs`                  | 730 days                        | Compliance evidence: the common SOC 2 / ISO 27001 floor, and the window for proving a GDPR erasure was honoured. |
| `places_cache`                | 24 hours                        | One document per 0.5° cell anyone ever opened.                                                                   |
| `rate_limits`                 | two windows (set by the writer) | One document per caller per window: the highest-volume collection, and pure garbage once the window closes.      |

## How it works

[`/api/cron/expire`](../../../src/frontend/src/app/api/cron/expire/route.ts)
runs once a day at 19:00 UTC (03:00 Manila), from the `crons` entry in
[`vercel.json`](../../../src/frontend/vercel.json). It queries each collection
for `expiresAt <= now` and deletes what it finds, in batches of 400, in the
order above, so a backlog clears transcripts before counters. The logic is
[`lib/expirySweep.ts`](../../../src/frontend/src/lib/expirySweep.ts).

**It costs nothing.** Each deleted document is one read plus one delete, both
inside Spark's free daily allowance (50 000 reads, 20 000 deletes). A run stops
at 10 000 deletes, half the allowance, so account erasure and cache purges still
have room. A larger backlog clears over the following days. Spark has no
overage: past the allowance Firestore refuses the operation rather than billing
for it. Vercel Hobby includes cron jobs that run once a day.

**Documents are deleted up to a day late.** The job runs daily, so a record can
outlive its `expiresAt` by up to 24 hours (Vercel Hobby may also start the run
any time within the scheduled hour). The privacy page words its retention
claims to allow for this. Erasure does not depend on the sweep: account deletion
removes documents directly.

## Setting it up

1. **Set `CRON_SECRET` in Vercel** (Production environment): any long random
   string, e.g. `openssl rand -hex 32`. Vercel sends it as
   `Authorization: Bearer <value>` on every cron run. Without it the route
   refuses every caller, Vercel included, and `/api/health` reports
   `expiry_sweep` as failing.
2. **Deploy the indexes**, which works on Spark:

   ```bash
   npx firebase-tools deploy --only firestore:indexes --project=fit-ready-iq
   ```

   `messages` is swept with a collection-group query, which needs the
   `COLLECTION_GROUP` index on `expiresAt` declared under `fieldOverrides` in
   [`firestore.indexes.json`](../../../firestore.indexes.json). Collection
   scope is indexed automatically. Until this is deployed, the `messages` step
   fails with `FAILED_PRECONDITION`, the other four still run, and the run
   answers 500.

   The overrides keep only the ascending index on `expiresAt`, the one the
   sweep uses. Do not set them to `indexes: []`: that disables the index the
   sweep's query depends on.

3. **Redeploy** so the `crons` entry registers.

## Verifying

- Vercel → Project → Settings → Cron Jobs lists `/api/cron/expire`, and **Run**
  starts it on demand.
- Each run logs one line: `expiry_sweep_completed` with the per-collection
  `deleted` counts, or `expiry_sweep_partial` naming what `failed`. Search the
  Vercel logs for `expiry_sweep`.
- `complete: false` means the run hit its budget or its 45-second time limit
  with expired documents possibly left. Tomorrow's run continues.

## Things worth knowing

- **Only documents that carry the field are swept.** Anything written before
  `expiresAt` was introduced never matches. For `chat_sessions` that is the gap
  recorded in `src/lib/userDataFootprint.ts`.
- **A field that is not a timestamp matches nothing.** `expiresAt` is written
  as a `Date`, which the Admin SDK stores as a timestamp. A string would
  silently never expire.
- **Moving to Blaze later:** add `"ttl": true` to each override and deploy the
  indexes again. Keep the sweep until the TTL policies report `ACTIVE`
  (`gcloud firestore fields ttls list`). The two do not conflict.
