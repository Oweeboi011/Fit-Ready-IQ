/**
 * Scrapes mountain advisories from the sources listed in
 * `scripts/advisory-sources.json` and writes `data/advisories.json`, which
 * `/api/advisories` serves.
 *
 * There is no common advisory API — park authorities, local government units
 * and rescue organisations each publish to their own page. So this reads a
 * declarative list of sources and selectors rather than hard-coding any site.
 *
 * It is a build/cron step, never part of a request: scraping in the request
 * path would be slow, fragile, and rude to the sites involved.
 *
 * Usage:
 *   npx tsx scripts/scrape-advisories.ts [--dry-run] [--source <id>]
 *
 * Only sources with `"enabled": true` are visited. Check each site's terms
 * before enabling it; robots.txt is honoured but that is a floor, not consent.
 */

import { chromium, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'scripts', 'advisory-sources.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'advisories.json');

/** Identifies the crawler so operators can contact us or block us. */
const USER_AGENT =
  'FitReadyIQAdvisoryBot/1.0 (+https://fitreadyiq.com/about; contact hello@fitreadyiq.com)';

/** Politeness gap between page loads, per source. */
const DELAY_MS = 2000;
const PAGE_TIMEOUT_MS = 20_000;

/** Anything older than this is history, matching the API's own window. */
const MAX_AGE_DAYS = 30;

type AdvisoryKind = 'closure' | 'hazard' | 'rescue' | 'emergency' | 'report' | 'announcement';

interface SourceConfig {
  id: string;
  name: string;
  enabled: boolean;
  url: string;
  areaName?: string;
  defaultKind: AdvisoryKind;
  coordinates?: [number, number];
  selectors: {
    item: string;
    title: string;
    body?: string;
    date?: string;
    link?: string;
  };
  kindKeywords?: Partial<Record<AdvisoryKind, string[]>>;
}

interface Advisory {
  id: string;
  kind: AdvisoryKind;
  title: string;
  body?: string;
  coordinates?: [number, number];
  areaName?: string;
  publishedAt: string;
  source: string;
  url?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * robots.txt check for the exact path.
 *
 * Deliberately conservative: any parse failure or fetch error is treated as
 * "do not crawl". Being wrongly blocked costs us one source; wrongly crawling
 * costs someone else their bandwidth and our reputation.
 */
async function isAllowedByRobots(target: string): Promise<boolean> {
  try {
    const url = new URL(target);
    const res = await fetch(`${url.origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    // No robots.txt at all means no stated restriction.
    if (res.status === 404) return true;
    if (!res.ok) return false;

    const body = await res.text();
    const lines = body.split('\n').map((l) => l.trim());

    let appliesToUs = false;
    const disallowed: string[] = [];
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(':');
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();

      if (key === 'user-agent') appliesToUs = value === '*' || USER_AGENT.includes(value);
      else if (key === 'disallow' && appliesToUs && value) disallowed.push(value);
    }

    return !disallowed.some((rule) => url.pathname.startsWith(rule));
  } catch {
    return false;
  }
}

/** Classify from the text, falling back to the source's declared default. */
function classify(text: string, config: SourceConfig): AdvisoryKind {
  const haystack = text.toLowerCase();
  for (const [kind, keywords] of Object.entries(config.kindKeywords ?? {})) {
    if ((keywords ?? []).some((k) => haystack.includes(k.toLowerCase()))) {
      return kind as AdvisoryKind;
    }
  }
  return config.defaultKind;
}

/** Stable across runs, so re-scraping does not duplicate an advisory. */
function advisoryId(sourceId: string, title: string, published: string): string {
  return createHash('sha1').update(`${sourceId}|${title}|${published}`).digest('hex').slice(0, 16);
}

async function scrapeSource(page: Page, config: SourceConfig): Promise<Advisory[]> {
  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });

  const raw = await page.evaluate((selectors) => {
    const text = (el: Element | null) => el?.textContent?.trim() ?? '';
    return Array.from(document.querySelectorAll(selectors.item))
      .slice(0, 50)
      .map((item) => ({
        title: text(item.querySelector(selectors.title)),
        body: selectors.body ? text(item.querySelector(selectors.body)) : '',
        date: selectors.date
          ? (item.querySelector(selectors.date)?.getAttribute('datetime') ??
            text(item.querySelector(selectors.date)))
          : '',
        href: selectors.link
          ? (item.querySelector(selectors.link) as HTMLAnchorElement | null)?.href
          : undefined,
      }));
  }, config.selectors);

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  return raw
    .filter((r) => r.title)
    .map((r) => {
      // An unparseable date is treated as "now" rather than dropped: a notice
      // whose date we cannot read is still a notice.
      const parsed = r.date ? Date.parse(r.date) : NaN;
      const publishedAt = new Date(Number.isNaN(parsed) ? Date.now() : parsed).toISOString();

      return {
        id: advisoryId(config.id, r.title, publishedAt),
        kind: classify(`${r.title} ${r.body}`, config),
        title: r.title,
        body: r.body || undefined,
        coordinates: config.coordinates,
        areaName: config.areaName,
        publishedAt,
        source: config.name,
        url: r.href,
      } satisfies Advisory;
    })
    .filter((a) => Date.parse(a.publishedAt) >= cutoff);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyIndex = args.indexOf('--source');
  const only = onlyIndex === -1 ? null : args[onlyIndex + 1];

  let config: { sources: SourceConfig[] };
  try {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    console.error(
      `No ${path.relative(ROOT, CONFIG_PATH)}. Copy advisory-sources.example.json and edit it.`
    );
    process.exitCode = 1;
    return;
  }

  const sources = config.sources.filter((s) => s.enabled && (!only || s.id === only));
  if (sources.length === 0) {
    console.log('No enabled sources. Nothing to do.');
    return;
  }

  let browser: Browser | undefined;
  const advisories: Advisory[] = [];

  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    for (const source of sources) {
      if (!(await isAllowedByRobots(source.url))) {
        console.warn(`skip ${source.id}: robots.txt disallows it (or could not be read)`);
        continue;
      }

      try {
        const found = await scrapeSource(page, source);
        advisories.push(...found);
        console.log(`${source.id}: ${found.length} advisories`);
      } catch (err) {
        // One broken source must not lose the others.
        console.error(`${source.id} failed:`, err instanceof Error ? err.message : err);
      }

      await sleep(DELAY_MS);
    }
  } finally {
    await browser?.close();
  }

  advisories.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  if (dryRun) {
    console.log(JSON.stringify(advisories.slice(0, 5), null, 2));
    console.log(`\n(dry run — ${advisories.length} total, nothing written)`);
    return;
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ scrapedAt: new Date().toISOString(), advisories }, null, 2)
  );
  console.log(`Wrote ${advisories.length} advisories to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

void main();
