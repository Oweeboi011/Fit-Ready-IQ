import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { createLogger } from '@/lib/logger';
import { cleanAdvisories, type Advisory } from '@/lib/advisories';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { ADVISORIES_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';

/**
 * Mountain advisories: closures, hazards, rescues, announcements.
 *
 * There is no universal API for this — advisories come from park authorities,
 * local government units and rescue organisations, and which one applies
 * depends entirely on the region. Two ways in, in order:
 *
 *   1. `data/advisories.json`, written by `npm run scrape:advisories`
 *   2. `ADVISORY_FEED_URL`, if a region does publish a JSON feed
 *
 * With neither, it returns an empty list marked `configured: false`.
 *
 * It deliberately does not fall back to sample data. An invented trail closure
 * or a fabricated rescue notice is the most dangerous thing this product could
 * display: someone could set out on a closed trail, or skip one they should
 * have avoided, because of a placeholder nobody remembered to remove.
 */

export async function GET(request: Request) {
  const log = createLogger('/api/advisories', request);
  // Cheap, but the `ADVISORY_FEED_URL` branch turns each call into an outbound
  // request to a park authority's server. Unmetered, that makes us a convenient
  // amplifier pointed at exactly the volunteer-run sites we depend on.
  const limit = await rateLimit(request, ADVISORIES_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  // The scraped file wins: it is the one a deployment actually controls.
  let scraped: string | null = null;
  try {
    scraped = await readFile(path.join(process.cwd(), 'data', 'advisories.json'), 'utf8');
  } catch (err) {
    // Missing is normal — not scraped yet — and falls through to the feed.
    // Anything else (permissions, a directory in its place) is a fault.
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      log.error('advisory_file_unreadable', err);
      return sourceUnreadable();
    }
  }

  if (scraped !== null) {
    try {
      return NextResponse.json(
        { configured: true, advisories: cleanAdvisories(JSON.parse(scraped)) },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
      );
    } catch (err) {
      // A corrupt file used to be swallowed as "not scraped yet", and with no
      // feed configured the answer became `configured: false` — every closure
      // silently gone. A source we have but cannot read is an error, and says so.
      log.error('advisory_file_corrupt', err);
      return sourceUnreadable();
    }
  }

  const feedUrl = process.env.ADVISORY_FEED_URL;

  if (!feedUrl) {
    return NextResponse.json(
      { configured: false, advisories: [] as Advisory[] },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } }
    );
  }

  try {
    // One signal across the headers *and* the body read: a feed that sends
    // headers promptly and then stalls used to hang the route to its limit.
    const res = await fetch(feedUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) throw new Error(`Feed responded ${res.status}`);

    // A malformed entry is dropped rather than rendered half-formed; a
    // half-parsed safety notice is worse than a missing one.
    const advisories = cleanAdvisories(await res.json());

    return NextResponse.json(
      { configured: true, advisories },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (err) {
    log.error('advisory_feed_failed', err);
    return NextResponse.json(
      { configured: true, error: 'Advisory feed unavailable', advisories: [] as Advisory[] },
      { status: 502 }
    );
  }
}

function sourceUnreadable() {
  return NextResponse.json(
    { configured: true, error: 'Advisory source unreadable', advisories: [] as Advisory[] },
    { status: 502 }
  );
}
