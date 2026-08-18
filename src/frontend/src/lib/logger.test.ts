import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLogger,
  REDACTED,
  requestId,
  sanitize,
  serializeError,
  upstreamSnippet,
} from './logger';

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => void stdout.push(line));
  vi.spyOn(console, 'error').mockImplementation((line: string) => void stderr.push(line));
  delete process.env.LOG_LEVEL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The single line a logger call produced, parsed back out of JSON. */
function lastLine(lines: string[]): Record<string, unknown> {
  expect(lines.length).toBeGreaterThan(0);
  return JSON.parse(lines[lines.length - 1]);
}

describe('sanitize — redaction', () => {
  it('redacts a token field', () => {
    expect(sanitize({ access_token: 'abc123' })).toEqual({ access_token: REDACTED });
  });

  it('redacts across naming conventions and casing', () => {
    const out = sanitize({
      accessToken: 'a',
      refresh_token: 'b',
      API_KEY: 'c',
      Authorization: 'd',
      clientSecret: 'e',
      password: 'f',
      cookie: 'g',
    }) as Record<string, unknown>;
    for (const value of Object.values(out)) expect(value).toBe(REDACTED);
  });

  it('redacts nested secrets, which is where they actually hide', () => {
    const out = sanitize({
      request: { headers: { authorization: 'Bearer live-token' } },
    }) as Record<string, Record<string, Record<string, unknown>>>;
    expect(out.request.headers.authorization).toBe(REDACTED);
  });

  it('leaves ordinary fields intact, so logs stay useful', () => {
    expect(sanitize({ status: 502, route: '/api/weather', ok: false })).toEqual({
      status: 502,
      route: '/api/weather',
      ok: false,
    });
  });

  it('truncates a long string rather than storing a payload', () => {
    const out = sanitize('x'.repeat(2000)) as string;
    expect(out.length).toBeLessThan(600);
    expect(out).toContain('+1488 chars');
  });

  it('bounds arrays', () => {
    expect((sanitize(Array.from({ length: 100 }, (_, i) => i)) as unknown[]).length).toBe(20);
  });

  it('stops at a depth limit instead of walking a cyclic-ish graph forever', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'too far' } } } } } };
    expect(JSON.stringify(sanitize(deep))).toContain('depth limit');
  });

  it('does not throw on a circular structure', () => {
    const cyclic: Record<string, unknown> = { name: 'x' };
    cyclic.self = cyclic;
    expect(() => JSON.stringify(sanitize(cyclic))).not.toThrow();
  });
});

describe('serializeError', () => {
  it('reduces an Error to name, message and stack', () => {
    const out = serializeError(new TypeError('bad input'));
    expect(out.name).toBe('TypeError');
    expect(out.message).toBe('bad input');
    expect(typeof out.stack).toBe('string');
  });

  it('follows `cause`, which is where fetch puts the real reason', () => {
    const err = new Error('fetch failed', { cause: new Error('ECONNREFUSED') });
    expect(JSON.stringify(serializeError(err))).toContain('ECONNREFUSED');
  });

  it('handles a thrown non-Error', () => {
    expect(serializeError('just a string')).toMatchObject({ name: 'NonError' });
  });

  it('does not leak a secret carried on the error object', () => {
    const err = Object.assign(new Error('request failed'), {
      config: { headers: { Authorization: 'Bearer live-token' } },
    });
    // The extra property is dropped entirely — only the three known fields
    // survive — which is the point: an error is not a bag we serialise whole.
    expect(JSON.stringify(serializeError(err))).not.toContain('live-token');
  });
});

describe('upstreamSnippet', () => {
  it('bounds the body', () => {
    expect(upstreamSnippet('y'.repeat(1000)).length).toBeLessThanOrEqual(200);
  });

  it('redacts a token quoted inside an opaque body', () => {
    const body = '{"message":"Bad Request","access_token":"live-secret-value"}';
    expect(upstreamSnippet(body)).not.toContain('live-secret-value');
  });

  it('keeps the diagnostic part', () => {
    expect(upstreamSnippet('{"message":"Bad Request"}')).toContain('Bad Request');
  });
});

describe('requestId', () => {
  it('reuses the platform id so our line and Vercel’s share a key', () => {
    const req = new Request('https://x.test', { headers: { 'x-vercel-id': 'iad1::abc123' } });
    expect(requestId(req)).toBe('iad1::abc123');
  });

  it('generates one when the platform provides none', () => {
    expect(requestId(new Request('https://x.test'))).toMatch(/[0-9a-f-]{36}/);
  });
});

describe('createLogger', () => {
  it('emits one JSON object per line with the standard fields', () => {
    createLogger('/api/weather').info('served');
    const line = lastLine(stdout);
    expect(line).toMatchObject({ level: 'info', event: 'served', route: '/api/weather' });
    expect(typeof line.timestamp).toBe('string');
    expect(typeof line.request_id).toBe('string');
  });

  it('sends warn and error to stderr, so platforms classify them correctly', () => {
    const log = createLogger('/api/chat');
    log.warn('a');
    log.error('b');
    expect(stderr).toHaveLength(2);
    expect(stdout).toHaveLength(0);
  });

  it('carries the same request id across every line of one request', () => {
    const req = new Request('https://x.test', { headers: { 'x-vercel-id': 'fixed-id' } });
    const log = createLogger('/api/chat', req);
    log.info('one');
    log.warn('two');
    expect(lastLine(stdout).request_id).toBe('fixed-id');
    expect(lastLine(stderr).request_id).toBe('fixed-id');
  });

  it('redacts fields passed at the call site', () => {
    createLogger('/api/strava/refresh').warn('rejected', { refresh_token: 'live' });
    expect(stderr[0]).not.toContain('live');
    expect(lastLine(stderr).refresh_token).toBe(REDACTED);
  });

  it('attaches a caught error under `error`', () => {
    createLogger('/api/chat').error('failed', new Error('boom'));
    expect(lastLine(stderr).error).toMatchObject({ name: 'Error', message: 'boom' });
  });

  it('drops levels below LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'error';
    const log = createLogger('/api/weather');
    log.info('quiet');
    log.warn('quiet');
    log.error('loud');
    expect(stdout).toHaveLength(0);
    expect(stderr).toHaveLength(1);
    expect(lastLine(stderr).event).toBe('loud');
  });

  it('falls back to info when LOG_LEVEL is nonsense', () => {
    process.env.LOG_LEVEL = 'chatty';
    createLogger('/api/weather').info('served');
    expect(stdout).toHaveLength(1);
  });

  it('always produces valid JSON, even for awkward input', () => {
    createLogger('/api/chat').info('odd', { nan: NaN, undef: undefined, nested: { fn: 'x' } });
    expect(() => JSON.parse(stdout[0])).not.toThrow();
  });
});
