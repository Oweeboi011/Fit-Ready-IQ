import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { cleanAdvisories, type Advisory } from '@/lib/advisories';

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

export async function GET() {
  // The scraped file wins: it is the one a deployment actually controls.
  try {
    const scraped = await readFile(path.join(process.cwd(), 'data', 'advisories.json'), 'utf8');
    return NextResponse.json(
      { configured: true, advisories: cleanAdvisories(JSON.parse(scraped)) },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch {
    /* not scraped yet — fall through to the feed URL */
  }

  const feedUrl = process.env.ADVISORY_FEED_URL;

  if (!feedUrl) {
    return NextResponse.json(
      { configured: false, advisories: [] as Advisory[] },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } }
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Feed responded ${res.status}`);

    // A malformed entry is dropped rather than rendered half-formed; a
    // half-parsed safety notice is worse than a missing one.
    const advisories = cleanAdvisories(await res.json());

    return NextResponse.json(
      { configured: true, advisories },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (err) {
    console.error('Advisory feed failed:', err);
    return NextResponse.json(
      { configured: true, error: 'Advisory feed unavailable', advisories: [] as Advisory[] },
      { status: 502 }
    );
  }
}
