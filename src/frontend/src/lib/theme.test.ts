import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyTheme,
  DEFAULT_THEME,
  isTheme,
  nextTheme,
  readStoredTheme,
  storeTheme,
  THEME_COLORS,
  THEME_STORAGE_KEY,
} from './theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
  document.head.innerHTML = '';
});

describe('the default', () => {
  it('is dark', () => {
    // Stated as a test because it is a product decision, not an implementation
    // detail: this is a map product used outdoors and at night.
    expect(DEFAULT_THEME).toBe('dark');
  });

  it('is what an unset preference resolves to', () => {
    expect(readStoredTheme()).toBeNull();
  });
});

describe('isTheme', () => {
  it('accepts the two real themes', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('light')).toBe(true);
  });

  it('rejects anything else, including near-misses', () => {
    expect(isTheme('Dark')).toBe(false);
    expect(isTheme('system')).toBe(false);
    expect(isTheme('')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe('nextTheme', () => {
  it('flips between the two', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
  });

  it('returns to where it started after two flips', () => {
    expect(nextTheme(nextTheme('dark'))).toBe('dark');
  });
});

describe('storage', () => {
  it('round-trips a choice', () => {
    storeTheme('light');
    expect(readStoredTheme()).toBe('light');
  });

  it('writes under the fri_ prefixed key the rest of the app uses', () => {
    storeTheme('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(THEME_STORAGE_KEY).toBe('fri_theme');
  });

  it('ignores a corrupted stored value rather than applying it', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'solarized');
    expect(readStoredTheme()).toBeNull();
  });

  it('survives storage being unavailable', () => {
    // Private browsing and hardened settings both throw here. A theme
    // preference must not take the page down with it.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => readStoredTheme()).not.toThrow();
    expect(readStoredTheme()).toBeNull();
    spy.mockRestore();

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => storeTheme('light')).not.toThrow();
    setSpy.mockRestore();
  });
});

describe('applyTheme', () => {
  it('adds the light class for light', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('removes the light class for dark, so toggling back really reverts', () => {
    applyTheme('light');
    applyTheme('dark');
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('sets color-scheme, which is the only way native scrollbars and controls follow', () => {
    applyTheme('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('updates the theme-color meta so browser chrome matches the page', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', THEME_COLORS.dark);
    document.head.appendChild(meta);

    applyTheme('light');
    expect(meta.getAttribute('content')).toBe(THEME_COLORS.light);
    applyTheme('dark');
    expect(meta.getAttribute('content')).toBe(THEME_COLORS.dark);
  });

  it('does not throw when the meta tag is absent', () => {
    expect(() => applyTheme('light')).not.toThrow();
  });

  it('leaves other classes on the element alone', () => {
    // <html> also carries the font variable class from next/font.
    document.documentElement.className = '__variable_inter';
    applyTheme('light');
    expect(document.documentElement.classList.contains('__variable_inter')).toBe(true);
    applyTheme('dark');
    expect(document.documentElement.classList.contains('__variable_inter')).toBe(true);
  });
});
