# Trip is the spine, and safety is a server-side timer

The product was place-centric: you browsed pins and nothing carried between visits. We are making **Trip** the entity everything hangs off — the Route or Place you're going to, the readiness judgement, the weather window, the gear list, the emergency contact, and afterwards the Activity that proves you went. This is what turns a browser into a product with memory, and it is what the progression ladder, the safety net and the trip record all read from.

The safety feature is a **server-side dead-man's switch**, not location tracking. A browser cannot track location in the background — iOS Safari suspends JavaScript when the screen locks, so "phone in pocket, app following you" is unimplementable on this platform at any cost. Instead the Trip carries an expected return time; the server watches the clock and notifies the emergency contact if no Check-in arrives. The traveller's device is not involved, which is precisely why it works in a canyon with no signal.

## Consequences

- The dormant `Itinerary` entity (`backend/src/domain/entities/__init__.py`) and the unused `itineraries` Firestore collection are the same concept and are renamed to Trip. Both are dead code today; this is nearly free now and expensive once either goes live.
- Trip lives in Next.js route handlers plus a scheduled function, not the undeployed FastAPI backend. Standing up and paying for a second runtime for one feature is not justified when the serverless stack already does the job.
- Check-in does double duty: the "are you back safe?" tap also closes the Trip and prompts to attach the matching Activity, so the safety feature is also the history feature. Trip completion is always human-confirmed — a geometry matcher may *suggest* an Activity, but never writes history unasked, because a false "you climbed this" destroys trust in every readiness judgement downstream.
- Offline support is scoped to the current Trip only — route line, elevation profile, gear, contacts, queued Check-in. Explicitly **not** map tiles: Google Maps' terms forbid caching them, so tiles would mean migrating off Google Maps entirely. That is a separate bet, deferred until people are demonstrably filing Trips.
