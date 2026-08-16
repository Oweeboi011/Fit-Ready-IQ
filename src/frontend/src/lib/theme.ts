/**
 * Light/dark theming.
 *
 * The product was built dark-only: 676 `slate-*` and several hundred
 * `white/[0.0x]` utilities hard-coded across 43 component files. Rather than
 * rewrite every one of those into `dark:` variants — which would be a very
 * large diff with a mistake behind every missed class — the neutral ramp itself
 * is redefined as CSS custom properties and *inverted* for light mode. See
 * `globals.css`. A component asking for `bg-slate-950` therefore keeps asking
 * for "the darkest surface", and the theme decides what that means.
 *
 * Consequences worth knowing:
 *   - Accent colours (blue, orange, emerald, red) are deliberately NOT themed.
 *     They carry meaning, and a warning that changes hue with the theme stops
 *     reading as a warning.
 *   - `text-white` stays white, because it sits on those accent fills. Only the
 *     *translucent* white overlays became `ink`, which does flip.
 *
 * Dark is the default and stays the default. `prefers-color-scheme` is
 * deliberately not consulted: this is a map product used outdoors and at night,
 * dark is the considered design, and a visitor whose OS happens to be in light
 * mode should not be handed the theme nobody designed against first.
 */

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** Dark unless the visitor has said otherwise. */
export const DEFAULT_THEME: Theme = 'dark';

/** localStorage key. `fri_` prefix matches the rest of the app's keys. */
export const THEME_STORAGE_KEY = 'fri_theme';

/**
 * The `<meta name="theme-color">` value per theme — the colour the browser
 * paints its own chrome with on mobile. Left unmatched, an installed PWA keeps
 * a near-black status bar above a white page.
 *
 * These are the literal values of `--surface-base` in each theme; they cannot
 * be read from CSS here because the meta tag is updated before paint.
 */
export const THEME_COLORS: Record<Theme, string> = {
  dark: '#020617',
  light: '#f8fafc',
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * The visitor's stored choice, or null if they have not made one.
 *
 * Returns null rather than throwing when storage is unavailable — private
 * browsing and hardened settings both block it, and a theme preference is not
 * worth failing a page render over.
 */
export function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persists a choice. Silent no-op when storage is unavailable. */
export function storeTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* the theme still applies for this session; it just will not be remembered */
  }
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

/**
 * Puts a theme on the document.
 *
 * Three things, all of which have to agree or the page looks half-switched:
 *   1. the `light` class on `<html>`, which swaps the CSS variables
 *   2. `color-scheme`, which is what makes native scrollbars, form controls and
 *      the canvas behind the page follow along — CSS variables cannot reach those
 *   3. `<meta name="theme-color">`, for browser chrome on mobile
 *
 * Written to be safe to call before React hydrates, because the inline script
 * in `layout.tsx` calls exactly this logic to avoid a flash of the wrong theme.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}
