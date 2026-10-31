/**
 * How long each kind of data is kept, as the privacy page states it.
 *
 * The enforcing constants live in modules the page cannot import cheaply (one
 * pulls in the Admin SDK), so these are restated here and
 * `privacyFacts.test.ts` checks every one against its source. A retention
 * change that forgets the page fails the build instead of shipping a policy
 * that says something the code does not do.
 */
export const RETENTION = {
  /** `CHAT_RETENTION_DAYS` in app/api/chat/route.ts */
  chatDays: 90,
  /** `AUDIT_RETENTION_DAYS` in lib/auditLog.ts */
  auditDays: 730,
  /** `CACHE_TTL_HOURS` in app/api/places/cache/route.ts */
  placesCacheHours: 24,
  /** Two windows of the hourly rules — `expiresAt` in lib/rateLimit.ts */
  rateLimitHours: 2,
  /** `HISTORY_TTL_MS` in components/ChatBot.tsx */
  browserChatHours: 24,
} as const;
