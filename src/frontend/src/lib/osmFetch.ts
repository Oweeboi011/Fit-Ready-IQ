import { upstreamSnippet } from '@/lib/logger';

/**
 * The OpenStreetMap services this app reads are volunteer-run, and their usage
 * policies ask every client to say who it is.
 */
const OSM_USER_AGENT = 'Fit-Ready-IQ/1.0 (+https://github.com/Oweeboi011/Fit-Ready-IQ)';

const OSM_TIMEOUT_MS = 8_000;

/** GET as JSON, identified and bounded in time. Throws on a non-2xx, naming the host. */
export async function fetchOsmJson<T>(url: string, timeoutMs = OSM_TIMEOUT_MS): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': OSM_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const host = new URL(url).host;
    throw new Error(`HTTP ${res.status} from ${host}: ${upstreamSnippet(await res.text())}`);
  }
  return (await res.json()) as T;
}
