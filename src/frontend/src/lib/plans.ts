/**
 * Plan and entitlement definitions.
 *
 * This is the single source of truth for what each tier unlocks. The landing
 * page renders from it, and `hasEntitlement` gates features in the app, so a
 * tier change here propagates to both the marketing copy and the paywall.
 *
 * Prices are placeholders — change them here, not in the landing page markup.
 */

export type PlanId = 'free' | 'pro' | 'guide';

/** Every capability the paywall can gate. Add one here before gating on it. */
export type Entitlement =
  | 'route_discovery'
  | 'save_places'
  | 'gpx_import'
  | 'strava_sync'
  | 'readiness_score'
  | 'ai_coach'
  | 'weather_forecast'
  | 'multi_athlete';

export interface Plan {
  id: PlanId;
  name: string;
  /** Price in USD per month when billed monthly. `0` for the free tier. */
  monthlyPrice: number;
  /** Price in USD per month when billed annually. `0` for the free tier. */
  annualMonthlyPrice: number;
  /** One line under the plan name — what kind of person this is for. */
  tagline: string;
  /** Bullets shown on the pricing card, in the order they should appear. */
  highlights: string[];
  entitlements: readonly Entitlement[];
  /** Exactly one plan should set this — it gets the primary button treatment. */
  featured?: boolean;
}

/** Days of full Pro access granted on signup, no card required. */
export const TRIAL_DAYS = 14;

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Explorer',
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    tagline: 'For deciding where to go this weekend.',
    highlights: [
      'Unlimited trail, summit and campsite discovery',
      'Save up to 10 places',
      'Live weather on every route',
    ],
    entitlements: ['route_discovery', 'save_places', 'weather_forecast'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 9,
    annualMonthlyPrice: 7,
    tagline: 'For knowing whether you can actually finish it.',
    highlights: [
      'Everything in Explorer, unlimited saves',
      'Readiness score for every route, from your real training',
      'Strava, Garmin, COROS and Apple Health sync',
      'AI coach that plans the weeks before your climb',
    ],
    entitlements: [
      'route_discovery',
      'save_places',
      'weather_forecast',
      'gpx_import',
      'strava_sync',
      'readiness_score',
      'ai_coach',
    ],
    featured: true,
  },
  {
    id: 'guide',
    name: 'Guide',
    monthlyPrice: 29,
    annualMonthlyPrice: 24,
    tagline: 'For guides and clubs taking other people up.',
    highlights: [
      'Everything in Pro',
      'Readiness across up to 25 athletes',
      'Group trip planning and shared itineraries',
      'Priority support',
    ],
    entitlements: [
      'route_discovery',
      'save_places',
      'weather_forecast',
      'gpx_import',
      'strava_sync',
      'readiness_score',
      'ai_coach',
      'multi_athlete',
    ],
  },
] as const;

/** Where the plan a visitor clicked is remembered until billing exists. */
export const SELECTED_PLAN_KEY = 'fri_selected_plan';

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && PLANS.some((p) => p.id === value);
}

/**
 * Remember which tier the visitor chose.
 *
 * Every pricing CTA currently runs the same sign-in, so without this the choice
 * between Explorer, Pro and Guide is thrown away the moment it is made. Storing
 * it costs nothing and is what a checkout flow will need first.
 */
export function rememberSelectedPlan(id: PlanId): void {
  try {
    localStorage.setItem(SELECTED_PLAN_KEY, id);
  } catch {
    /* private mode — the ?plan= query param still carries the choice */
  }
}

export function readSelectedPlan(): PlanId | null {
  try {
    const raw = localStorage.getItem(SELECTED_PLAN_KEY);
    return isPlanId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/**
 * Whether a plan unlocks a capability. Callers that hold a trial should pass
 * `'pro'` for the duration of the trial rather than branching on trial state.
 */
export function hasEntitlement(planId: PlanId, entitlement: Entitlement): boolean {
  return getPlan(planId).entitlements.includes(entitlement);
}

/** Percentage saved by paying annually, rounded, for the billing toggle copy. */
export function annualSavingPercent(plan: Plan): number {
  if (plan.monthlyPrice === 0) return 0;
  return Math.round((1 - plan.annualMonthlyPrice / plan.monthlyPrice) * 100);
}
