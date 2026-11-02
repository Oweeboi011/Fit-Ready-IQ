import { NextResponse, type NextRequest } from 'next/server';

import { normaliseKomootTour, parseKomootLink } from '@/lib/komootTour';
import { createLogger, upstreamSnippet } from '@/lib/logger';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { KOMOOT_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/**
 * A Komoot tour from a shared link: `GET ?url=<komoot tour link>`.
 *
 * Komoot has no public API. This reads the same endpoint its tour pages do,
 * which answers for public tours and for private ones whose link carries a
 * `share_token`. It is undocumented and can change without notice, so every
 * failure mode is named in `reason` for the UI to say plainly:
 *
 *   - `invalid`    — not a Komoot tour link
 *   - `smarttour`  — a curated Komoot "smart tour", which this cannot read
 *   - `private`    — the tour is not public and the link has no share token
 *   - `not_found`  — no such tour
 *   - `unreadable` — Komoot answered with something we do not recognise
 *   - `upstream`   — Komoot is down, slow or refusing us
 *
 * Proxied rather than fetched from the browser: Komoot sends no CORS headers,
 * and a server-side fetch lets the CDN cache public tours for everyone.
 */

const API_BASE = 'https://api.komoot.de/v007/tours';
const TIMEOUT_MS = 10_000;

function fail(reason: string, status: number, error: string) {
  return NextResponse.json({ error, reason }, { status });
}

export async function GET(request: NextRequest) {
  const log = createLogger('/api/komoot/tour', request);
  const limit = await rateLimit(request, KOMOOT_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  const link = parseKomootLink(request.nextUrl.searchParams.get('url') ?? '');
  if (!link.ok) {
    return link.reason === 'smarttour'
      ? fail(
          'smarttour',
          400,
          'Komoot smart tours are not supported; open it in Komoot and save it as your own tour, then share that link.'
        )
      : fail('invalid', 400, 'That is not a Komoot tour link.');
  }

  const params = new URLSearchParams({ _embedded: 'coordinates' });
  if (link.shareToken) params.set('share_token', link.shareToken);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/${link.id}?${params}`, {
      headers: { Accept: 'application/hal+json, application/json' },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      return fail(
        'private',
        403,
        'This tour is private. Share it from Komoot with a link, or make it public.'
      );
    }
    if (res.status === 404) return fail('not_found', 404, 'Komoot has no tour with that id.');
    if (!res.ok) {
      log.warn('komoot_upstream_rejected', {
        status: res.status,
        body: upstreamSnippet(await res.text()),
      });
      return fail('upstream', 502, 'Komoot did not answer. Try again in a minute.');
    }

    const route = normaliseKomootTour(await res.json(), link.id);
    if (!route) {
      log.warn('komoot_tour_unreadable', { id: link.id });
      return fail('unreadable', 502, 'Komoot sent a tour we could not read.');
    }

    return NextResponse.json(route, {
      headers: {
        // A share token is a credential for someone else's private tour: never
        // let a shared cache hold the answer. Public tours cache for an hour.
        'Cache-Control': link.shareToken
          ? 'private, no-store'
          : 'public, max-age=600, s-maxage=3600, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    log.error('komoot_failed', err);
    return fail('upstream', 502, 'Komoot did not answer. Try again in a minute.');
  } finally {
    clearTimeout(timer);
  }
}
