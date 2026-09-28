import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUDIT_RETENTION_DAYS } from './auditLog';
import { RETENTION } from './privacyFacts';

/** Reads a numeric constant out of a module the test cannot import cheaply. */
function constantIn(file: string, name: string): number {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
  const match = source.match(new RegExp(`const ${name} = ([^;]+);`));
  if (!match) throw new Error(`${name} not found in ${file}`);
  // Evaluates simple arithmetic like `24 * 60 * 60 * 1000`.
  return Function(`"use strict"; return (${match[1].replace(/_/g, '')});`)() as number;
}

describe('the privacy page states what the code enforces', () => {
  it('chat transcripts', () => {
    expect(RETENTION.chatDays).toBe(constantIn('app/api/chat/route.ts', 'CHAT_RETENTION_DAYS'));
  });

  it('audit records', () => {
    expect(RETENTION.auditDays).toBe(AUDIT_RETENTION_DAYS);
  });

  it('the shared places cache', () => {
    expect(RETENTION.placesCacheHours).toBe(
      constantIn('app/api/places/cache/route.ts', 'CACHE_TTL_HOURS')
    );
  });

  it('browser-held chat', () => {
    expect(RETENTION.browserChatHours * 3_600_000).toBe(
      constantIn('components/ChatBot.tsx', 'HISTORY_TTL_MS')
    );
  });
});
