import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { clearPersonalStorage, PERSONAL_STORAGE_KEYS } from './personalStorage';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('clearPersonalStorage', () => {
  it('removes what describes the person and keeps plain preferences', () => {
    localStorage.setItem('fri_activities', '[{"id":"a"}]');
    localStorage.setItem('fri_chat_history', '[]');
    localStorage.setItem('fri_last_location', '{"lat":1,"lng":2}');
    localStorage.setItem('fri_theme', 'dark');
    localStorage.setItem('fri_map_hidden_layers', '[]');

    clearPersonalStorage();

    expect(localStorage.getItem('fri_activities')).toBeNull();
    expect(localStorage.getItem('fri_chat_history')).toBeNull();
    expect(localStorage.getItem('fri_last_location')).toBeNull();
    expect(localStorage.getItem('fri_theme')).toBe('dark');
    expect(localStorage.getItem('fri_map_hidden_layers')).toBe('[]');
  });
});

/**
 * Every `fri_*` storage key in the source must be classified — either listed
 * as personal, or listed here as a preference with nothing about the person in
 * it. A new key that holds personal data would otherwise survive sign-out
 * unnoticed, which is how the original set did.
 */
const NOT_PERSONAL = new Set([
  'fri_active_tab',
  'fri_filters',
  'fri_map_hidden_layers',
  'fri_seen_intro',
  'fri_selected_plan',
  'fri_theme',
  'fri_role', // a Firebase custom-claim name, not a storage key
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('storage key coverage', () => {
  it('classifies every fri_* key in the source', () => {
    const found = new Set<string>();
    for (const file of sourceFiles(path.join(__dirname, '..'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/'(fri_[a-z_]+)'/g)) {
        found.add(match[1]);
      }
    }
    const personal = new Set<string>(PERSONAL_STORAGE_KEYS);
    const unclassified = [...found].filter((k) => !personal.has(k) && !NOT_PERSONAL.has(k));
    expect(unclassified).toEqual([]);
  });
});
