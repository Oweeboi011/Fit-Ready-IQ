import type { ElevationSample } from './elevationProfile';
import type { KomootRoute } from './komootTour';
import { haversineKm } from './mapsGeometry';
import { classifyDifficulty, DIFFICULTY_LABELS, type Difficulty } from './routeDifficulty';
import type { WeatherWindow } from './weatherWindow';

/**
 * What a route asks of you, and what to bring for it.
 *
 * Rule-based on purpose: every line traces back to a number on the route
 * (distance, ascent, altitude, surface, Komoot's time estimate) or to the
 * forecast, so the advice can be checked and costs nothing per view. A model
 * would write it more warmly and invent things the route does not say.
 *
 * The honesty rule holds here too. Where an input is unknown the line that
 * depends on it is left out or says it is unknown — water is never sized from
 * a guessed duration, and layers are never sized from an altitude we lack.
 */

export type ChecklistPriority = 'essential' | 'recommended';

export interface ChecklistItem {
  id: string;
  label: string;
  /** Why this route needs it, in terms of the route. */
  why: string;
  priority: ChecklistPriority;
}

export interface SteepestClimb {
  /** Average gradient over the stretch, in percent. */
  gradePct: number;
  /** Where the stretch starts, km from the start. */
  atKm: number;
}

export interface RouteBriefing {
  difficulty: Difficulty;
  /** Plain sentences, most important first. */
  summary: string[];
  checklist: ChecklistItem[];
  /** Hours including breaks, or null when Komoot gave no estimate. */
  plannedHours: number | null;
  highPointM: number | null;
  lowPointM: number | null;
  steepest: SteepestClimb | null;
  samples: ElevationSample[];
}

export interface BriefingConditions {
  window?: WeatherWindow | null;
  /** Current temperature near the start, °C. */
  tempC?: number | null;
}

/** Litres an hour of moving, temperate and hot. A common outdoor-guidance figure. */
const WATER_L_PER_HOUR = 0.5;
const WATER_L_PER_HOUR_HOT = 0.75;
const HOT_C = 25;

/** Environmental lapse rate: air cools about this much per 1,000 m climbed. */
const LAPSE_C_PER_1000M = 6.5;

/** Breaks and photo stops on top of Komoot's moving time. */
const BREAK_FACTOR = 1.25;

/** A climb has to last this long to count; a 20 m kick is not "the steep part". */
const CLIMB_WINDOW_KM = 0.3;

/** Share of the route off the mapped network before it is worth a mention. */
const OFF_GRID_NOTABLE = 0.05;

const BIKE_SPORTS = /bike|bicycle|mtb|cycling/i;

// Komoot's live keys are descriptive (`wt#alpine_hiking_path`); the graded
// `hike_dN` form appears on older tours. Mountain hiking paths (T2/T3) are not
// in here: rough, but not scrambling.
const ALPINE_WAYS = /hike_d[4-6]|alpine|via_ferrata|scramble|climbing/;

const ROUGH_SURFACES = /nature|ground|unpaved|gravel|alpine|rock|sand|snow/;
const FIRM_SURFACES = /asphalt|paved|concrete|paving|cobbles|compacted/;

const SPORT_LABELS: Record<string, string> = {
  hike: 'hike',
  mountaineering: 'mountain tour',
  jogging: 'run',
  mtb: 'mountain-bike ride',
  mtb_easy: 'mountain-bike ride',
  mtb_advanced: 'mountain-bike ride',
  racebike: 'road ride',
  touringbicycle: 'bike ride',
  e_touringbicycle: 'e-bike ride',
  e_mtb: 'e-MTB ride',
};

const KOMOOT_GRADES: Record<string, string> = {
  easy: 'easy',
  moderate: 'intermediate',
  difficult: 'expert',
};

/** Profile samples along the path, with cumulative distance. */
export function routeSamples(route: Pick<KomootRoute, 'path' | 'altitudes'>): ElevationSample[] {
  let km = 0;
  return route.path.map((point, i) => {
    if (i > 0) km += haversineKm(route.path[i - 1], point);
    return { distanceKm: km, elevationM: route.altitudes[i] ?? null };
  });
}

/**
 * The steepest sustained climb: the highest average gradient over any stretch
 * of at least {@link CLIMB_WINDOW_KM}. Null when altitude is too patchy to say.
 */
export function steepestClimb(samples: ElevationSample[]): SteepestClimb | null {
  const known = samples.filter(
    (s): s is { distanceKm: number; elevationM: number } => s.elevationM != null
  );
  let best: SteepestClimb | null = null;
  let j = 0;
  for (let i = 0; i < known.length; i++) {
    j = Math.max(j, i);
    while (j < known.length && known[j].distanceKm - known[i].distanceKm < CLIMB_WINDOW_KM) j++;
    if (j >= known.length) break;
    const run = known[j].distanceKm - known[i].distanceKm;
    const grade = ((known[j].elevationM - known[i].elevationM) / (run * 1000)) * 100;
    if (grade > 0 && (best === null || grade > best.gradePct)) {
      best = { gradePct: Math.round(grade), atKm: Math.round(known[i].distanceKm * 10) / 10 };
    }
  }
  return best;
}

function roundHalf(value: number): number {
  return Math.max(0.5, Math.round(value * 2) / 2);
}

/** 3.5 → "3h 30m". */
export function formatHours(hours: number): string {
  let whole = Math.floor(hours);
  let minutes = Math.round((hours - whole) * 60);
  if (minutes === 60) {
    whole += 1;
    minutes = 0;
  }
  return minutes ? `${whole}h ${String(minutes).padStart(2, '0')}m` : `${whole}h`;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Sum of the shares whose key matches. */
function shareOf(items: KomootRoute['surfaces'], pattern: RegExp): number {
  return items.filter((s) => pattern.test(s.type)).reduce((sum, s) => sum + s.share, 0);
}

/** Everything the rules read, derived once. */
interface Context {
  route: KomootRoute;
  difficulty: Difficulty;
  movingHours: number | null;
  plannedHours: number | null;
  highPointM: number | null;
  lowPointM: number | null;
  /** High point above the start, when both are known. */
  climbAboveStartM: number | null;
  steepest: SteepestClimb | null;
  window: WeatherWindow | null;
  tempC: number | null;
  isBike: boolean;
  offGrid: boolean;
}

// ---- Summary ---------------------------------------------------------------

function headline({ route, difficulty }: Context): string {
  const sport = SPORT_LABELS[route.sport] ?? 'route';
  const descent = route.descentM != null ? ` and ${route.descentM} m of descent` : '';
  const climb =
    route.ascentM != null ? ` with ${route.ascentM} m of climbing${descent}` : ', climbing unknown';
  const rating =
    difficulty === 'unknown'
      ? 'We cannot rate its difficulty without the ascent.'
      : `${DIFFICULTY_LABELS[difficulty]} by our rating.`;
  const grade = route.komootGrade
    ? ` Komoot grades it ${KOMOOT_GRADES[route.komootGrade] ?? route.komootGrade}.`
    : '';
  const km = route.distanceKm.toFixed(1);
  // "an 8.2 km", "an 11.0 km", "an 18.5 km": the article follows the sound.
  const article = /^(8|11\.|18\.)/.test(km) ? 'An' : 'A';
  return `${article} ${km} km ${sport}${climb}. ${rating}${grade}`;
}

function timing({ movingHours, plannedHours }: Context): string {
  if (movingHours == null || plannedHours == null) {
    return 'Komoot gave no time estimate for this tour, so plan your own pace.';
  }
  return (
    `Komoot estimates ${formatHours(movingHours)} of moving time; ` +
    `plan about ${formatHours(plannedHours)} with breaks.`
  );
}

function terrain({ highPointM, lowPointM, steepest }: Context): string | null {
  if (highPointM == null || lowPointM == null) return null;
  const steep =
    steepest && steepest.gradePct >= 5
      ? `; the steepest sustained stretch averages ${steepest.gradePct}% from km ${steepest.atKm}.`
      : '.';
  return `The route runs from ${lowPointM} m to a high point of ${highPointM} m${steep}`;
}

function underfoot({ route }: Context): string | null {
  const surface = route.surfaces.find((s) => s.type !== 'sf#unknown');
  const way = route.wayTypes.find((w) => w.type !== 'wt#off_grid');
  const parts = [
    surface && `${surface.label.toLowerCase()} (${percent(surface.share)})`,
    way && `mostly on ${way.label.toLowerCase()} (${percent(way.share)})`,
  ].filter(Boolean);
  return parts.length ? `Underfoot: ${parts.join(', ')}.` : null;
}

function describeRoute(ctx: Context): string[] {
  const lines = [headline(ctx), timing(ctx), terrain(ctx), underfoot(ctx)];
  if (ctx.offGrid) {
    lines.push(`${percent(ctx.route.offGridShare)} of it leaves the mapped path network.`);
  }
  if (ctx.window) lines.push(ctx.window.summary);
  return lines.filter((line): line is string => line !== null);
}

// ---- Checklist rules: each returns its item, or null when it does not apply.

type Rule = (ctx: Context) => ChecklistItem | null;

const weatherRule: Rule = ({ window }) =>
  window?.status === 'none'
    ? {
        id: 'weather',
        label: 'Rethink the date',
        why: 'The forecast has no safe window long enough for this route in the next two days.',
        priority: 'essential',
      }
    : null;

const waterRule: Rule = ({ plannedHours, tempC }) => {
  if (plannedHours == null) {
    return {
      id: 'water',
      label: 'Water',
      why: 'No time estimate, so size it yourself: about 0.5 L an hour.',
      priority: 'essential',
    };
  }
  const hot = tempC != null && tempC >= HOT_C;
  const rate = hot ? WATER_L_PER_HOUR_HOT : WATER_L_PER_HOUR;
  const heat = hot ? `, raised for ${Math.round(tempC)}°C` : '';
  return {
    id: 'water',
    label: `${roundHalf(plannedHours * rate)} L of water`,
    why:
      `About ${rate} L an hour over ~${formatHours(plannedHours)}${heat}. ` +
      'Check for refill points before relying on them.',
    priority: 'essential',
  };
};

const foodRule: Rule = ({ plannedHours }) =>
  plannedHours != null && plannedHours >= 3
    ? {
        id: 'food',
        label: 'Lunch and snacks',
        why: `Over ${formatHours(plannedHours)} you will want roughly 200–300 kcal an hour on top of a proper meal.`,
        priority: 'essential',
      }
    : {
        id: 'food',
        label: 'A snack',
        why: 'Short enough not to need a meal, but carry something.',
        priority: 'recommended',
      };

const layersRule: Rule = ({ climbAboveStartM, highPointM, tempC }) => {
  if (climbAboveStartM == null || highPointM == null || climbAboveStartM < 400) return null;
  const drop = (climbAboveStartM / 1000) * LAPSE_C_PER_1000M;
  const atTop =
    tempC != null
      ? ` (about ${Math.round(tempC - drop)}°C if it is ${Math.round(tempC)}°C at the start).`
      : '.';
  return {
    id: 'layers',
    label: 'Warm layer and windproof',
    why: `The high point is ${climbAboveStartM} m above the start, typically ~${Math.round(drop)}°C colder before wind chill${atTop}`,
    priority: highPointM >= 1500 ? 'essential' : 'recommended',
  };
};

const shellRule: Rule = ({ window, highPointM }) => {
  const wet = window?.hazards.some((h) => /rain|storm/i.test(h.kind)) ?? false;
  return {
    id: 'shell',
    label: 'Waterproof jacket',
    why: wet
      ? 'The forecast window includes rain.'
      : 'Weather turns faster than forecasts on exposed ground.',
    priority: wet || (highPointM ?? 0) >= 1500 ? 'essential' : 'recommended',
  };
};

const bikeRule: Rule = ({ isBike }) =>
  isBike
    ? {
        id: 'bike',
        label: 'Helmet, spare tube, pump and multitool',
        why: 'A puncture far from the road ends the ride without them.',
        priority: 'essential',
      }
    : null;

const footwearRule: Rule = ({ isBike, route }) => {
  if (isBike) return null;
  const alpine = shareOf(route.wayTypes, ALPINE_WAYS);
  if (alpine > 0) {
    return {
      id: 'footwear',
      label: 'Sturdy boots with grippy soles',
      why: `${percent(alpine)} is alpine path or harder: expect rock, exposure and possibly hands-on sections.`,
      priority: 'essential',
    };
  }
  const rough = shareOf(route.surfaces, ROUGH_SURFACES);
  if (rough >= 0.3) {
    return {
      id: 'footwear',
      label: 'Trail shoes or boots',
      why: `${percent(rough)} of the route is unpaved.`,
      priority: 'essential',
    };
  }
  // Only call it firm ground when Komoot says so. An unknown surface is not a
  // paved one, and recorded tours often carry no surface data at all.
  const firm = shareOf(route.surfaces, FIRM_SURFACES);
  if (firm >= 0.7) {
    return {
      id: 'footwear',
      label: 'Comfortable walking shoes',
      why: `${percent(firm)} is paved or compacted.`,
      priority: 'recommended',
    };
  }
  return {
    id: 'footwear',
    label: 'Trail shoes or boots',
    why: `Komoot does not know the surface for ${percent(1 - rough - firm)} of the route; assume rough ground.`,
    priority: 'essential',
  };
};

const polesRule: Rule = ({ isBike, route, steepest }) => {
  const descent = route.descentM ?? 0;
  const grade = steepest?.gradePct ?? 0;
  if (isBike || (descent < 800 && grade < 20)) return null;
  return {
    id: 'poles',
    label: 'Trekking poles',
    why:
      descent >= 800
        ? `${descent} m of descent is hard on the knees.`
        : `The steepest stretch averages ${grade}%.`,
    priority: 'recommended',
  };
};

const navigationRule: Rule = ({ route, offGrid }) => ({
  id: 'navigation',
  label: 'Route downloaded for offline use',
  why: offGrid
    ? `${percent(route.offGridShare)} leaves mapped paths, and signal is often poor in the hills.`
    : 'Signal is unreliable outdoors; save the tour offline in Komoot.',
  priority: offGrid ? 'essential' : 'recommended',
});

const lightRule: Rule = ({ plannedHours }) =>
  plannedHours != null && plannedHours >= 5
    ? {
        id: 'light',
        label: 'Head torch',
        why: `A ${formatHours(plannedHours)} day leaves little margin if you start late or run slow.`,
        priority: plannedHours >= 7 ? 'essential' : 'recommended',
      }
    : null;

const sunRule: Rule = ({ highPointM, plannedHours }) => {
  const high = (highPointM ?? 0) >= 2000;
  if (!high && (plannedHours ?? 0) < 4) return null;
  return {
    id: 'sun',
    label: 'Sun cream, sunglasses and a hat',
    why: high
      ? 'UV is markedly stronger above 2,000 m.'
      : 'Hours of exposure, even on a cloudy day.',
    priority: 'recommended',
  };
};

const firstAidRule: Rule = () => ({
  id: 'first_aid',
  label: 'Small first-aid kit',
  why: 'Blister plasters at minimum.',
  priority: 'essential',
});

const phoneRule: Rule = ({ plannedHours }) => ({
  id: 'phone',
  label: (plannedHours ?? 0) >= 5 ? 'Charged phone and a power bank' : 'Charged phone',
  why: 'Navigation drains the battery, and it is how you call for help.',
  priority: 'essential',
});

const tellSomeoneRule: Rule = ({ difficulty, plannedHours, offGrid }) =>
  difficulty === 'challenging' || (plannedHours ?? 0) >= 6 || offGrid
    ? {
        id: 'plan',
        label: 'Tell someone your route and return time',
        why: 'A long or remote day; someone should know when to raise the alarm.',
        priority: 'essential',
      }
    : null;

const trainingRule: Rule = ({ difficulty, route }) =>
  difficulty === 'challenging' && route.ascentM != null
    ? {
        id: 'training',
        label: 'Build up to it',
        why: `In the weeks before, do at least one outing with around ${Math.round((route.ascentM * 0.7) / 50) * 50} m of ascent so the climbing is not a surprise.`,
        priority: 'recommended',
      }
    : null;

/** In display order: anything that might cancel the day comes first. */
const RULES: Rule[] = [
  weatherRule,
  waterRule,
  foodRule,
  layersRule,
  shellRule,
  bikeRule,
  footwearRule,
  polesRule,
  navigationRule,
  lightRule,
  sunRule,
  firstAidRule,
  phoneRule,
  tellSomeoneRule,
  trainingRule,
];

export function buildBriefing(
  route: KomootRoute,
  conditions: BriefingConditions = {}
): RouteBriefing {
  const samples = routeSamples(route);
  const known = samples.map((s) => s.elevationM).filter((v): v is number => v != null);
  const highPointM = known.length ? Math.max(...known) : null;
  const lowPointM = known.length ? Math.min(...known) : null;
  const startM = samples[0]?.elevationM ?? null;
  const movingHours = route.durationSeconds != null ? route.durationSeconds / 3600 : null;

  const ctx: Context = {
    route,
    difficulty: classifyDifficulty(route.distanceKm, route.ascentM),
    movingHours,
    plannedHours: movingHours != null ? movingHours * BREAK_FACTOR : null,
    highPointM,
    lowPointM,
    climbAboveStartM: highPointM != null && startM != null ? highPointM - startM : null,
    steepest: steepestClimb(samples),
    window: conditions.window ?? null,
    tempC: conditions.tempC ?? null,
    isBike: BIKE_SPORTS.test(route.sport),
    offGrid: route.offGridShare >= OFF_GRID_NOTABLE,
  };

  return {
    difficulty: ctx.difficulty,
    summary: describeRoute(ctx),
    checklist: RULES.map((rule) => rule(ctx)).filter(
      (item): item is ChecklistItem => item !== null
    ),
    plannedHours: ctx.plannedHours,
    highPointM,
    lowPointM,
    steepest: ctx.steepest,
    samples,
  };
}
