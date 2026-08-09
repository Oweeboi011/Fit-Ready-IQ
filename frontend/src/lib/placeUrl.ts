/**
 * Deep links to a place on the map.
 *
 * Nothing in the app used to be addressable: no tab, no selected place, no
 * viewport. Back did nothing inside `/app`, a reload dropped you at the top of
 * the routes list, and Share had no URL of ours worth sending. These helpers
 * are the encoding both ends agree on.
 */

export type PlaceKind = 'route' | 'mountain' | 'campsite' | 'activity';

const KINDS: readonly PlaceKind[] = ['route', 'mountain', 'campsite', 'activity'];

export interface PlaceRef {
  kind: PlaceKind;
  id: string;
}

/** `route:r12` — kind first so a malformed id can never be read as a kind. */
export function encodePlaceRef(kind: PlaceKind, id: string): string {
  return `${kind}:${id}`;
}

export function decodePlaceRef(value: string | null): PlaceRef | null {
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator <= 0) return null;

  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id || !KINDS.includes(kind as PlaceKind)) return null;

  return { kind: kind as PlaceKind, id };
}

/** Absolute URL for sharing. Falls back to a relative one during SSR. */
export function placeShareUrl(kind: PlaceKind, id: string): string {
  const path = `/app?place=${encodeURIComponent(encodePlaceRef(kind, id))}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}
