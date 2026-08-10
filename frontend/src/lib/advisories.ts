/**
 * Mountain advisory types and validation.
 *
 * Split out from `/api/advisories/route.ts` so components can depend on the
 * shape without depending on a Next.js route module — route files pull in
 * `node:fs`/`node:path` and are meant to be a leaf, not something client
 * components import from (`components-do-not-import-pages` in
 * `.dependency-cruiser.cjs`).
 */

export type AdvisoryKind =
  'closure' | 'hazard' | 'rescue' | 'emergency' | 'report' | 'announcement';

export interface Advisory {
  id: string;
  kind: AdvisoryKind;
  title: string;
  body?: string;
  /** Place this concerns, if the feed pins it. GeoJSON order, `[lng, lat]`. */
  coordinates?: [number, number];
  areaName?: string;
  /** ISO 8601. */
  publishedAt: string;
  source: string;
  url?: string;
}

export const ADVISORY_KINDS: readonly AdvisoryKind[] = [
  'closure',
  'hazard',
  'rescue',
  'emergency',
  'report',
  'announcement',
];

/** Advisories older than this are history, not guidance. */
export const ADVISORY_MAX_AGE_DAYS = 30;

export function isAdvisory(value: unknown): value is Advisory {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== 'string' || a.id === '') return false;
  if (typeof a.title !== 'string' || a.title === '') return false;
  if (typeof a.source !== 'string') return false;
  if (typeof a.publishedAt !== 'string' || Number.isNaN(Date.parse(a.publishedAt))) return false;
  if (!ADVISORY_KINDS.includes(a.kind as AdvisoryKind)) return false;

  if (a.coordinates !== undefined) {
    if (!Array.isArray(a.coordinates) || a.coordinates.length !== 2) return false;
    if (!a.coordinates.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  }
  return true;
}

/** Drops malformed entries and anything past the window. */
export function cleanAdvisories(raw: unknown): Advisory[] {
  const list = Array.isArray(raw) ? raw : ((raw as { advisories?: unknown })?.advisories ?? []);
  const cutoff = Date.now() - ADVISORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  return (Array.isArray(list) ? list : [])
    .filter(isAdvisory)
    .filter((a) => Date.parse(a.publishedAt) >= cutoff)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 100);
}
