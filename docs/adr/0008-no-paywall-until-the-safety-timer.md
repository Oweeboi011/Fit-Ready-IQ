# No paywall until the safety timer ships

Decided 2026-11-03 by the owner. `src/frontend/src/lib/plans.ts` defines tiers and
entitlements, and `hasEntitlement()` exists, but nothing calls it, and that stays true for now.
Everything is free.

Pro is sold on readiness and on the Trip. Today readiness can only rate a route that has a known
climb. The list rates only routes tagged with an `ascent` in OpenStreetMap, and the rest are
measured from terrain only once opened (#142). The Trip exists, but its safety timer does not
(ADR-0003). Charging now would mean charging for a score most of the list cannot show and for a
safety net that does not yet catch anyone.

## Consequences

- No payment provider is chosen or integrated. The pricing page's copy comes from `plans.ts` and
  must not promise a paid feature the app cannot deliver.
- Revisit when the server-side safety timer ships. That is the first feature a free tier should
  not include without limit, because each alert costs money to send.
- Enforcement goes through `hasEntitlement()` on the server when it comes. A client-only check
  is presentation, not a paywall.
