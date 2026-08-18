/**
 * Every place a user's data lives, named once.
 *
 * Export and erasure are the same question asked twice — "what is ours about
 * this person?" — and the way that pair goes wrong in practice is drift: a
 * collection gets added, the export learns about it, the deletion does not, and
 * the product quietly keeps data it told a regulator it had erased. Or the
 * reverse, and the export under-reports. Both are reportable failures under
 * GDPR Art. 15 and Art. 17.
 *
 * So neither route enumerates collections itself. They both walk this list, and
 * adding a user-scoped collection means adding one entry here.
 *
 * Two shapes, because ownership is expressed two ways in this schema:
 *   - subcollections under `users/{uid}/…`, owned by their path
 *   - top-level collections carrying a `user_id` field
 *
 * That split is not an accident of history — it mirrors firestore.rules, where
 * the first kind is governed by `isOwner(userId)` and the second by
 * `ownsExisting()`. If a collection is added to one, it belongs in the other.
 */

/**
 * Documents keyed directly by uid, outside `users/{uid}`.
 *
 * `strava_tokens` holds OAuth credentials rather than user content, so erasure
 * must remove it — leaving a live, non-expiring refresh token behind for a
 * deleted account would be the worst possible remnant. It is deliberately absent
 * from the export: handing someone their own OAuth tokens in a JSON file is not
 * fulfilling an access request, it is minting a new copy of a credential.
 */
export const USER_KEYED_DOCUMENTS = ['strava_tokens'] as const;

/** Subcollections of `users/{uid}`. Deleted by deleting the parent recursively. */
export const USER_SUBCOLLECTIONS = ['saved_places', 'strava_activities'] as const;

/** Top-level collections whose documents carry a `user_id` field. */
export const USER_OWNED_COLLECTIONS = [
  'activities',
  'training_programs',
  'training_sessions',
  'itineraries',
] as const;

/**
 * Also `user_id`-scoped, but its documents own a `messages` subcollection, so
 * removing one means a recursive delete rather than a document delete. Kept
 * separate from USER_OWNED_COLLECTIONS so that the generic path above cannot
 * quietly orphan the subcollection — deleting a Firestore document does not
 * touch what hangs beneath it, and the messages are the sensitive part.
 */
export const USER_OWNED_TREE_COLLECTIONS = ['chat_sessions'] as const;

export type UserSubcollection = (typeof USER_SUBCOLLECTIONS)[number];
export type UserOwnedCollection = (typeof USER_OWNED_COLLECTIONS)[number];
export type UserOwnedTreeCollection = (typeof USER_OWNED_TREE_COLLECTIONS)[number];

/**
 * Collections that hold user-attributable data but are deliberately NOT erased,
 * with the reason. Stated explicitly because an auditor's next question after
 * "what do you delete?" is "what do you keep, and why?", and an undocumented
 * exception looks identical to an oversight.
 */
export const RETAINED_ON_DELETE: Record<string, string> = {
  audit_logs:
    'Erasure records are the evidence that erasure happened. Deleting them with ' +
    'the account would destroy the proof the record exists to provide. They hold ' +
    'a uid and counters, never the erased content. GDPR Art. 17(3)(b): retention ' +
    'for compliance with a legal obligation.',
  rate_limits:
    'Keyed on a salted hash of a credential, not a uid — there is nothing to ' +
    'match against an account. Self-expires within the hour via TTL.',
  places_cache:
    'Regional and shared, derived from Google Places rather than from the user. ' +
    'Contains no user identifiers.',
};

/**
 * Transcripts written before `/api/chat` began stamping `user_id` carry no
 * identity, so erasure cannot match them to an account. They are not retained
 * by choice — they are unreachable, which is a different and worse thing.
 *
 * The 90-day TTL on `expiresAt` clears them regardless of identity, so the
 * backlog drains on its own; this note exists so nobody reads the gap as a
 * decision. Sessions written from now on are erasable by uid.
 */
export const UNATTRIBUTED_LEGACY_DATA =
  'chat_sessions documents created before the user_id stamp cannot be matched ' +
  'to an account. They expire via the 90-day TTL on expiresAt.';
