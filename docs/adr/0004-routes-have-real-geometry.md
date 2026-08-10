# Routes have real geometry, from three producers

Route metrics were fabricated. In `frontend/src/app/app/page.tsx`, a "route" was a Google Places pin whose `distance_km` was the *driving distance from the user to the trailhead*, whose `elevation_gain_m` came from five elevation probes scattered near that point rather than along any path, and whose `strava_segment` was generated from the name. Readiness scoring — the capability the Pro tier is sold on — was scheduled to be built on those numbers. It cannot be.

A Route is now defined by geometry: an ordered `[lng, lat]` line, with length computed from the line and elevation gain sampled along it. Three producers write that one shape — **OSM import** via Overpass (real trail geometry and named peaks, free under ODbL with attribution), **GPX upload** (already parsed by `gpxParser.ts`), and **user-drawn routes** snapped to the trail network by OpenStreetRouteService's `foot-hiking` profile. GPX export then falls out as a pure function of geometry regardless of which producer made the Route.

## Consequences

- Google Places stays, but only for what it is good at: finding **Places** (summits, campsites, trailheads). It never again supplies Route metrics.
- Places-derived pins with fabricated distances must stop claiming precision *before* readiness ships. The credibility risk is highest with the target user — someone who has walked the trail knows it is not 47 km.
- `Mountain` and `Campsite` collapse into Place types rather than sibling entities, removing three near-duplicate fetch-and-render paths. Keeping "Route" ambiguous between a pin and a line is what let the fabricated metrics ship; the type split makes that class of bug structurally impossible.
- Routing uses OpenRouteService rather than Google Directions: walking mode routes over roads and sidewalks and would send a hiker up the access road. Self-hosting GraphHopper or Valhalla was rejected for now — it needs a persistent multi-GB container, and the stack is otherwise entirely serverless.
- Weather moves from `currentConditions:lookup` to a forecast source. Current conditions at a mountain you are not standing on, three days before you go, cannot answer the only weather question a planner has: *when should I go?*
