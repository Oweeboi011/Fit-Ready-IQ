// Trips (ADR-0003): where you are going, when you leave, and when you expect
// to be back. Pure — the Firestore side is `useTrips.ts` — so every rule about
// time is testable without a clock or a database.
//
// Built without the safety timer. A Trip records an expected return and the UI
// says when it has passed, but nothing yet tells an emergency contact: that
// needs a scheduled function and a way to send messages, and until it exists
// the app must never imply that someone will be told.

import { estimateAscentHours } from '@/lib/routeDuration';

export type TripTargetKind = 'route' | 'mountain' | 'campsite';

/** What the trip is to: a place the user had open when they planned it. */
export interface TripTarget {
  kind: TripTargetKind;
  /** The place's id, so the trip can reopen it. */
  id: string;
  name: string;
  /** `[lng, lat]`. */
  coordinates: [number, number];
}

export interface Trip {
  id: string;
  target: TripTarget;
  /** Epoch ms. */
  startAt: number;
  /** Epoch ms. When the user expects to be back. */
  expectedReturnAt: number;
  /** Epoch ms, once the user has said they are back. Null until then. */
  checkedInAt: number | null;
  notes: string;
}

/**
 * Where a trip stands at `now`. Stored state is only the check-in; the rest is
 * the clock, so a trip goes overdue without anything having to write it.
 */
export type TripState = 'upcoming' | 'active' | 'overdue' | 'back';

export function tripState(trip: Trip, now: number): TripState {
  if (trip.checkedInAt !== null) return 'back';
  if (now < trip.startAt) return 'upcoming';
  if (now <= trip.expectedReturnAt) return 'active';
  return 'overdue';
}

/** Longest trip the form accepts. A longer one is an expedition, planned elsewhere. */
const MAX_TRIP_DAYS = 14;

/** How far ahead a trip can be planned. */
const MAX_LEAD_DAYS = 365;

export const MAX_NOTES_CHARS = 500;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** When no climb is known there is nothing to estimate from; half a day is a starting point, not a claim. */
const DEFAULT_TRIP_HOURS = 4;

/**
 * A suggested length for the form, in whole hours: the slower end of the climb
 * estimate where there is one, so the expected return is not optimistic.
 */
export function suggestedHours(elevationGainM: number | null | undefined): number {
  return estimateAscentHours(elevationGainM)?.high ?? DEFAULT_TRIP_HOURS;
}

/** Why a draft cannot be saved, or null when it can. Each message is shown as is. */
export function tripProblem(
  draft: Pick<Trip, 'startAt' | 'expectedReturnAt' | 'notes'>,
  now: number
): string | null {
  const { startAt, expectedReturnAt, notes } = draft;
  if (!Number.isFinite(startAt) || !Number.isFinite(expectedReturnAt)) {
    return 'Choose when you leave and when you expect to be back.';
  }
  // A few minutes' grace: the form's default start is "now", and saving takes a moment.
  if (startAt < now - 15 * 60_000) return 'The start is in the past.';
  if (startAt > now + MAX_LEAD_DAYS * DAY) return 'Trips can be planned up to a year ahead.';
  if (expectedReturnAt <= startAt) return 'The expected return must be after the start.';
  if (expectedReturnAt - startAt > MAX_TRIP_DAYS * DAY) {
    return `A trip can last at most ${MAX_TRIP_DAYS} days.`;
  }
  if (notes.length > MAX_NOTES_CHARS) return `Notes can be at most ${MAX_NOTES_CHARS} characters.`;
  return null;
}

/** Upcoming and active first by start, then overdue, with finished trips last, newest first. */
export function sortTrips(trips: Trip[], now: number): Trip[] {
  const rank: Record<TripState, number> = { overdue: 0, active: 1, upcoming: 2, back: 3 };
  return [...trips].sort((a, b) => {
    const [ra, rb] = [rank[tripState(a, now)], rank[tripState(b, now)]];
    if (ra !== rb) return ra - rb;
    return ra === 3 ? b.startAt - a.startAt : a.startAt - b.startAt;
  });
}

/** `datetime-local` value for an epoch, in the browser's own zone. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Epoch ms from a `datetime-local` value, or NaN when empty or malformed. */
export function fromLocalInput(value: string): number {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(value).getTime() : NaN;
}

/**
 * The next whole hour on the local clock after `now`: a start time people
 * actually choose. Local, not UTC — in a half-hour zone the UTC hour is :30.
 */
export function nextHour(now: number): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return d.getTime() + HOUR;
}

/** The return time the form suggests for a trip starting at `startAt`. */
export function suggestedReturn(
  startAt: number,
  elevationGainM: number | null | undefined
): number {
  return startAt + suggestedHours(elevationGainM) * HOUR;
}
