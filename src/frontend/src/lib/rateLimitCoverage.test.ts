import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guards the invariant that `rateLimitRules.ts` states: every API route has a
 * ceiling.
 *
 * This is the check that would have caught the original gap. Eleven of fourteen
 * routes shipped unmetered — including the OAuth exchange and the sync that
 * fans one request into ten upstream calls and 300 writes — because nothing
 * connected "adding a route" to "giving it a budget". A convention that lives
 * only in a comment is one that erodes on the first busy afternoon.
 *
 * It reads the route files rather than importing them: importing a route pulls
 * in the Admin SDK and the whole handler graph, and the question here is a
 * structural one that the source text answers directly.
 */

const API_ROOT = path.join(__dirname, '..', 'app', 'api');

/**
 * Routes that legitimately have no limiter, each with the reason.
 *
 * An exemption is a decision, so it is written down next to the route it
 * exempts. Adding a name here is deliberately more effort than adding a rule.
 */
const EXEMPT: Record<string, string> = {
  'health/route.ts':
    'The uptime monitor polls this every 15 minutes and a limiter would let a ' +
    'burst of traffic blind the monitor exactly when it is needed. It performs ' +
    'credential-presence checks only — no upstream calls, no database reads — ' +
    'so there is no cost to meter. Mirrors the backend, where /health is ' +
    'explicitly @limiter.exempt.',
  'admin/cache/route.ts': 'Behind requireRole; admins are few, named and audited.',
  'admin/strava-sync/route.ts': 'Behind requireRole; admins are few, named and audited.',
  'admin/users/route.ts': 'Behind requireRole; admins are few, named and audited.',
  'integrations/firebase/route.ts': 'Behind requireRole; admins are few, named and audited.',
};

function routeFiles(dir: string, base = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full, rel));
    } else if (entry === 'route.ts') {
      found.push(rel);
    }
  }
  return found;
}

describe('rate-limit coverage', () => {
  const routes = routeFiles(API_ROOT);

  it('finds the API routes at all, so a silent glob failure cannot pass this suite', () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it.each(routes)('%s is rate limited or explicitly exempt', (route) => {
    const source = readFileSync(path.join(API_ROOT, route), 'utf8');
    const limited = source.includes('rateLimit(');
    const exempt = route.replace(/\\/g, '/') in EXEMPT;

    expect(
      limited || exempt,
      `${route} has no rate limit and no entry in EXEMPT. Add a rule to ` +
        `src/lib/rateLimitRules.ts and call rateLimit(), or record why it is exempt.`
    ).toBe(true);
  });

  it.each(routes)('%s passes its verified caller to every rateLimit call', (route) => {
    // A route that has authenticated the caller must key the budget on them.
    // Leaving the third argument off quietly falls back to the IP, which puts
    // every user behind one NAT into a single bucket — and was, before the
    // bearer string stopped counting, the thing that made the limit forgeable.
    const source = readFileSync(path.join(API_ROOT, route), 'utf8');
    if (!/requireUser\(|optionalUser\(|currentRole\(/.test(source)) return;

    const calls = source.match(/rateLimit\([^)]*\)/g) ?? [];
    for (const call of calls) {
      const args = call.slice('rateLimit('.length, -1).split(',');
      expect(
        args.length,
        `${route}: \`${call}\` authenticates the caller but budgets by IP. Pass the ` +
          `verified user as the third argument.`
      ).toBe(3);
    }
  });

  it('has no stale exemptions left behind by deleted routes', () => {
    const normalised = routes.map((r) => r.replace(/\\/g, '/'));
    for (const exempt of Object.keys(EXEMPT)) {
      expect(normalised, `${exempt} is exempted but no longer exists`).toContain(exempt);
    }
  });

  it('gives every rule a distinct bucket name, or two routes share one budget', async () => {
    const rules = await import('./rateLimitRules');
    const names = Object.values(rules).map((rule) => rule.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
