'use client';

import type { PlannerWaypoint } from './gpxBuilder';

/**
 * Planned routes, kept on the device.
 *
 * Local rather than Firestore so a plan survives without an account — the
 * planner is usable signed out, and losing a half-built route at sign-in would
 * be the worst possible moment to lose it. Syncing these to an account is a
 * later step; the storage shape is already the wire shape.
 */

export interface SavedPlan {
  id: string;
  name: string;
  waypoints: PlannerWaypoint[];
  /** Epoch millis. */
  savedAt: number;
  /**
   * Routed kilometres, cached so the list does not recompute.
   *
   * `null` when the plan was saved without a route — routing was unavailable, or
   * no path exists between the waypoints. It used to hold a straight-line figure
   * in that case, which is always short and read as a real distance in the plan
   * list. Plans saved before this change still carry their old number; the
   * validator never checked this field, so both shapes load.
   */
  distanceKm: number | null;
}

export const SAVED_PLANS_KEY = 'fri_saved_plans';

/** Enough for any realistic use, low enough to stay inside the storage quota. */
export const MAX_PLANS = 50;

function isPlan(value: unknown): value is SavedPlan {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id === '') return false;
  if (typeof p.name !== 'string') return false;
  if (typeof p.savedAt !== 'number') return false;
  if (!Array.isArray(p.waypoints) || p.waypoints.length === 0) return false;

  return p.waypoints.every((w) => {
    if (typeof w !== 'object' || w === null) return false;
    const c = (w as { coordinates?: unknown }).coordinates;
    return (
      Array.isArray(c) &&
      c.length === 2 &&
      c.every((n) => typeof n === 'number' && Number.isFinite(n))
    );
  });
}

export function loadPlans(): SavedPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_PLANS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A corrupt entry is dropped rather than crashing the list it appears in.
    return parsed.filter(isPlan).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function persist(plans: SavedPlan[]): SavedPlan[] {
  const trimmed = plans.slice(0, MAX_PLANS);
  try {
    localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota or private mode — the plan still exists for this session */
  }
  return trimmed;
}

/** Saves a new plan, or replaces one with the same id. */
export function savePlan(plan: SavedPlan): SavedPlan[] {
  const existing = loadPlans().filter((p) => p.id !== plan.id);
  return persist([plan, ...existing].sort((a, b) => b.savedAt - a.savedAt));
}

export function deletePlan(id: string): SavedPlan[] {
  return persist(loadPlans().filter((p) => p.id !== id));
}
