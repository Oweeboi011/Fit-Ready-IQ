// The assistant's tools (#26): what Gemini may call, and what each call does.
//
// Decisions, from the issues that asked them:
// - #27 Gemini 2.5 Flash supports function calling over the REST API already in
//   use. A turn becomes a short loop: the model asks for a tool, we answer with
//   its result, it either asks again or replies. No SDK needed.
// - #28 Tools live here, not inline in /api/chat: the declarations, the request
//   context they may read, and the executors, with the one side effect (weather)
//   injected so everything else is testable without a network.
// - #29 "Analyze route" returns the place's own facts — length, climb,
//   difficulty, time estimate — and names what is unknown, so the model narrates
//   numbers rather than inventing them.
// - #30 Tools read only the place the user has open and public weather. They
//   never read or write Firestore, so no tool can reach anyone else's data and
//   none runs with more authority than the caller has in the browser.
// - #31 Saving is never done by a tool. The model can only *propose* a save; the
//   chat shows Save / Not now, and the browser writes with the user's own
//   sign-in, through the same path as the bookmark button.

import { parseCampsite, parseMountain, parseRoute } from '@/lib/placesCacheSchema';
import type { Campsite, Mountain, Route } from '@/lib/placesTypes';
import { DIFFICULTY_LABELS } from '@/lib/routeDifficulty';
import { estimateAscentHours } from '@/lib/routeDuration';
import type { SavedPlace } from '@/lib/useSavedPlaces';

/** The place open in the details view, as the client sends it. Untrusted. */
export type OpenPlace =
  | { kind: 'route'; place: Route }
  | { kind: 'mountain'; place: Mountain }
  | { kind: 'campsite'; place: Campsite };

export interface ChatContext {
  openPlace: OpenPlace | null;
  /** Where the user is, for weather when nothing is open. `[lng, lat]`. */
  location: [number, number] | null;
}

const PARSERS = { route: parseRoute, mountain: parseMountain, campsite: parseCampsite } as const;

/**
 * The context from a request body, rebuilt through the same schema that guards
 * the shared places cache. Anything malformed is dropped rather than refused:
 * the question still deserves an answer, just without tools that need a place.
 */
export function parseChatContext(raw: unknown): ChatContext {
  const body = (raw ?? {}) as { openPlace?: unknown; location?: unknown };
  return { openPlace: parseOpenPlace(body.openPlace), location: parseLocation(body.location) };
}

function parseOpenPlace(raw: unknown): OpenPlace | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kind, place } = raw as { kind?: unknown; place?: unknown };
  if (kind !== 'route' && kind !== 'mountain' && kind !== 'campsite') return null;
  const parsed = PARSERS[kind](place);
  return parsed ? ({ kind, place: parsed } as OpenPlace) : null;
}

function parseLocation(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [lng, lat] = raw;
  return typeof lng === 'number' &&
    typeof lat === 'number' &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
    ? [lng, lat]
    : null;
}

/** Gemini `functionDeclarations`, in its OpenAPI-subset schema. */
export const TOOL_DECLARATIONS = [
  {
    name: 'analyze_open_place',
    description:
      'Facts about the route, peak or campsite the user currently has open in the app: ' +
      'length, climb, difficulty, summit height and a time estimate, plus which of those ' +
      'are unknown. Call this before describing the open place; never estimate what it ' +
      'reports as unknown.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'analyze_weather',
    description:
      'Current conditions, hazard alerts and the soonest good weather window at the open ' +
      "place, or at the user's location when nothing is open. Pass `hours` for how long " +
      'the outing takes, so the window is long enough for it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        hours: {
          type: 'NUMBER',
          description: 'How long the outing takes, in hours (1 to 240). Optional.',
        },
      },
    },
  },
  {
    name: 'propose_save_open_place',
    description:
      "Offer to save the open place to the user's saved places. This does not save it: " +
      'the user is shown a Save button and decides. Call it only when the user asks to ' +
      'save, bookmark or keep the open place.',
    parameters: { type: 'OBJECT', properties: {} },
  },
] as const;

/** A save the user still has to confirm. Carries no place data: the client already has it. */
export interface SaveProposal {
  action: 'save_place';
  placeId: string;
  name: string;
}

export interface ToolDeps {
  /** The weather report for a point, or throws. `hours` scopes the window. */
  weather: (lat: number, lng: number, hours: number | null) => Promise<unknown>;
}

export interface ToolOutcome {
  /** What the model is told, as the function's response. */
  response: Record<string, unknown>;
  proposal?: SaveProposal;
}

const NOTHING_OPEN = {
  error: 'nothing_open',
  detail: 'The user has no place open. Ask them to open a route, peak or campsite first.',
};

/** Facts about the open place, with every unknown named rather than left out. */
export function placeFacts(open: OpenPlace): Record<string, unknown> {
  if (open.kind === 'route') {
    const r = open.place;
    const hours = estimateAscentHours(r.elevation_gain_m);
    return {
      kind: 'route',
      name: r.name,
      activity: r.activity_type,
      length_km: r.distance_km,
      climb_m: r.elevation_gain_m,
      difficulty: DIFFICULTY_LABELS[r.difficulty],
      climb_time_hours: hours ? { low: hours.low, high: hours.high } : null,
      unknown: [
        ...(r.distance_km == null ? ['length'] : []),
        ...(r.elevation_gain_m == null ? ['climb', 'climb time'] : []),
        ...(r.difficulty === 'unknown' ? ['difficulty'] : []),
      ],
    };
  }
  if (open.kind === 'mountain') {
    const m = open.place;
    return {
      kind: 'peak',
      name: m.name,
      type: m.mountain_type,
      summit_m: m.elevation_m,
      unknown: [
        ...(m.elevation_m == null ? ['summit height'] : []),
        'trail length',
        'climb from the trailhead',
      ],
    };
  }
  const c = open.place;
  return {
    kind: 'campsite',
    name: c.name,
    amenities: c.amenities?.length ? c.amenities : null,
    unknown: c.amenities?.length ? [] : ['amenities'],
  };
}

function weatherHours(args: Record<string, unknown>): number | null {
  const hours = args.hours;
  return typeof hours === 'number' && hours > 0 && hours <= 240 ? Math.round(hours) : null;
}

function redactWeatherReport(report: unknown): unknown {
  if (!report || typeof report !== 'object') return report;

  const clone = { ...(report as Record<string, unknown>) };
  const location = clone.location;
  if (location && typeof location === 'object') {
    const safeLocation = { ...(location as Record<string, unknown>) };
    delete safeLocation.lat;
    delete safeLocation.lng;
    delete safeLocation.latitude;
    delete safeLocation.longitude;
    clone.location = safeLocation;
  }

  delete clone.lat;
  delete clone.lng;
  delete clone.latitude;
  delete clone.longitude;
  delete clone.coordinates;

  return clone;
}

/** Runs one tool call. Never throws: a failure is reported to the model as a result. */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ChatContext,
  deps: ToolDeps
): Promise<ToolOutcome> {
  switch (name) {
    case 'analyze_open_place':
      return { response: ctx.openPlace ? placeFacts(ctx.openPlace) : NOTHING_OPEN };

    case 'analyze_weather': {
      const point = ctx.openPlace?.place.coordinates ?? ctx.location;
      if (!point) {
        return {
          response: { error: 'no_location', detail: 'Neither a place nor a location is known.' },
        };
      }
      try {
        const report = await deps.weather(point[1], point[0], weatherHours(args));
        const safeReport = redactWeatherReport(report);
        return {
          response: { at: ctx.openPlace?.place.name ?? "the user's location", report: safeReport },
        };
      } catch {
        return {
          response: {
            error: 'weather_unavailable',
            detail: 'The weather service did not answer. Say so; do not describe conditions.',
          },
        };
      }
    }

    case 'propose_save_open_place': {
      const open = ctx.openPlace;
      if (!open) return { response: NOTHING_OPEN };
      return {
        response: {
          status: 'awaiting_confirmation',
          detail: 'A Save button is now shown to the user. Do not say it has been saved.',
        },
        proposal: { action: 'save_place', placeId: open.place.id, name: open.place.name },
      };
    }

    default:
      return { response: { error: 'unknown_tool', detail: `No tool named ${name}.` } };
  }
}

/**
 * The saved-place record for an open place, built exactly as the sidebar's
 * bookmark button builds it, so a save confirmed in the chat is the same save.
 */
export function savedPlaceFor(open: OpenPlace): Omit<SavedPlace, 'savedAt'> {
  const { place } = open;
  const base = {
    id: place.id,
    name: place.name,
    coordinates: place.coordinates,
    photos: place.photos,
    place_id: place.place_id,
  };
  if (open.kind === 'route') {
    return {
      ...base,
      type: 'route',
      difficulty: open.place.difficulty,
      activity_type: open.place.activity_type,
      distance_km: open.place.distance_km,
      elevation_gain_m: open.place.elevation_gain_m ?? undefined,
    };
  }
  if (open.kind === 'mountain') {
    return {
      ...base,
      type: 'mountain',
      elevation_m: open.place.elevation_m ?? undefined,
      prominence_m: open.place.prominence_m,
      mountain_type: open.place.mountain_type,
    };
  }
  return { ...base, type: 'campsite', rating: open.place.rating };
}
