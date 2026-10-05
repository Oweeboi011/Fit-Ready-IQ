import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/weather/route';

/**
 * Two providers, and the question that matters is what happens when the first
 * one fails: with both keys set, a Google outage must not become a 502 while an
 * OpenWeather key sits unused.
 */

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const GOOGLE_CURRENT = {
  weatherCondition: { type: 'CLEAR', description: { text: 'Clear' } },
  temperature: { degrees: 18 },
  humidity: 50,
  wind: { speed: { value: 10, unit: 'KPH' } },
};
const OPENWEATHER_CURRENT = {
  weather: [{ main: 'Clouds', description: 'scattered clouds' }],
  main: { temp: 16, humidity: 60 },
  wind: { speed: 2 },
};

/** Route each upstream URL to a canned answer; `googleDown` fails every Google call. */
function upstream({ googleDown = false } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('weather.googleapis.com')) {
      if (googleDown) return new Response('backend error', { status: 503 });
      return url.includes('forecast') ? json({ forecastHours: [] }) : json(GOOGLE_CURRENT);
    }
    if (url.includes('/forecast')) return json({ list: [] });
    return json(OPENWEATHER_CURRENT);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const get = (query = 'lat=16.6&lng=120.9') =>
  GET(new NextRequest(`https://fitreadyiq.test/api/weather?${query}`));

beforeEach(() => {
  delete process.env.GOOGLE_WEATHER_API_KEY;
  delete process.env.OPENWEATHER_API_KEY;
});

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/weather', () => {
  it('rejects a missing or out-of-range location', async () => {
    process.env.GOOGLE_WEATHER_API_KEY = 'g';
    expect((await get('lat=200&lng=0')).status).toBe(400);
    expect((await get('lng=0')).status).toBe(400);
  });

  it('says it is not configured, rather than inventing conditions, with no key', async () => {
    expect((await get()).status).toBe(503);
  });

  it('uses Google when it is configured and healthy', async () => {
    process.env.GOOGLE_WEATHER_API_KEY = 'g';
    process.env.OPENWEATHER_API_KEY = 'o';
    upstream();
    const body = await (await get()).json();
    expect(body.provider).toBe('google-weather');
  });

  it('fails over to OpenWeather when Google is down and OpenWeather is configured', async () => {
    process.env.GOOGLE_WEATHER_API_KEY = 'g';
    process.env.OPENWEATHER_API_KEY = 'o';
    const fetchMock = upstream({ googleDown: true });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('openweather');
    expect(body.current.description).toBe('scattered clouds');
    // The forecast fails over too, so the window and alerts are still computed.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/forecast?'))).toBe(true);
    // Google is not retried for the forecast: a second timeout would overrun the budget.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('googleapis'))).toHaveLength(1);
  });

  it('reports 502 when Google is down and there is nothing to fail over to', async () => {
    process.env.GOOGLE_WEATHER_API_KEY = 'g';
    upstream({ googleDown: true });
    const res = await get();
    expect(res.status).toBe(502);
    // Upstream text stays in the log, never in the response.
    expect(JSON.stringify(await res.json())).not.toContain('backend error');
  });

  it('uses OpenWeather alone when it is the only key', async () => {
    process.env.OPENWEATHER_API_KEY = 'o';
    upstream();
    expect((await (await get()).json()).provider).toBe('openweather');
  });
});
