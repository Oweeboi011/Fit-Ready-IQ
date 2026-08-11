/**
 * What the map is allowed to draw.
 *
 * Hiking and cycling are separate because they answer different questions —
 * a bikepacker turning off foot trails wants the map to actually get quieter,
 * and lumping them under one "routes" flag made that impossible.
 */
export type MapLayer =
  'hiking' | 'cycling' | 'activities' | 'mountains' | 'campsites' | 'saved' | 'advisories';

export const MAP_LAYERS: readonly MapLayer[] = [
  'hiking',
  'cycling',
  'mountains',
  'campsites',
  'saved',
  'activities',
  'advisories',
];

export const MAP_LAYER_LABELS: Record<MapLayer, string> = {
  hiking: 'Hiking routes',
  cycling: 'Cycling routes',
  mountains: 'Peaks',
  campsites: 'Campsites',
  saved: 'Saved places',
  activities: 'My activity lines',
  advisories: 'Mountain advisories',
};

/** Dot colour in the toggle list, matched to the marker it controls. */
export const MAP_LAYER_SWATCH: Record<MapLayer, string> = {
  hiking: 'bg-blue-500',
  cycling: 'bg-violet-500',
  mountains: 'bg-amber-700',
  campsites: 'bg-green-600',
  saved: 'bg-amber-500',
  activities: 'bg-orange-500',
  advisories: 'bg-rose-500',
};

export const HIDDEN_LAYERS_KEY = 'fri_map_hidden_layers';

export function readHiddenLayers(): MapLayer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HIDDEN_LAYERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is MapLayer => MAP_LAYERS.includes(v as MapLayer));
  } catch {
    return [];
  }
}

export function writeHiddenLayers(layers: MapLayer[]): void {
  try {
    window.localStorage.setItem(HIDDEN_LAYERS_KEY, JSON.stringify(layers));
  } catch {
    /* private mode — the toggles still work for this session */
  }
}

/** Which layer a route belongs to, from its activity type. */
export function layerForActivityType(activityType: string): 'hiking' | 'cycling' {
  return activityType === 'bike' ? 'cycling' : 'hiking';
}
