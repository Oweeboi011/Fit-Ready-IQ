'use client';

import { useSyncExternalStore } from 'react';
import type { WeatherAlert } from './weatherAlerts';

/**
 * Where forecast alerts already fetched for one place (the Details modal, or
 * the dock's "weather here" panel) become the badge on every nearby route,
 * mountain and campsite card — without a fetch of its own for each one.
 *
 * Cards that fall outside any grid cell we've actually checked show no
 * badge. That is honest: we have no data for them, so we say nothing,
 * rather than fetching a paid forecast for every card just to fill a badge.
 */

const GRID_DEGREES = 0.1; // ~11 km — a forecast cell, not a per-pin fetch

function gridKey(lat: number, lng: number): string {
  const gLat = Math.round(lat / GRID_DEGREES) * GRID_DEGREES;
  const gLng = Math.round(lng / GRID_DEGREES) * GRID_DEGREES;
  return `${gLat.toFixed(1)}_${gLng.toFixed(1)}`;
}

const store = new Map<string, WeatherAlert[]>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

/** Records the alerts fetched for one coordinate, keyed to its grid cell. */
export function recordWeatherAlerts(lat: number, lng: number, alerts: WeatherAlert[]): void {
  store.set(gridKey(lat, lng), alerts);
  notify();
}

export function getWeatherAlertsNear(lat: number, lng: number): WeatherAlert[] {
  return store.get(gridKey(lat, lng)) ?? [];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders whenever any coordinate's alerts are recorded, for cards near this one. */
export function useWeatherAlertsNear(lat: number, lng: number): WeatherAlert[] {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
  return getWeatherAlertsNear(lat, lng);
}
