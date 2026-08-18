'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  applyTheme,
  DEFAULT_THEME,
  nextTheme,
  readStoredTheme,
  storeTheme,
  type Theme,
} from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Holds the active theme and keeps the document in step with it.
 *
 * The stored preference is read in an *effect*, never in a `useState`
 * initializer. Reading `localStorage` during render makes the server and the
 * client disagree about the first paint, and React responds by throwing away
 * the server tree — the same rule the map's `fri_last_location` restore
 * follows, for the same reason.
 *
 * That would normally mean one frame of the default theme before the stored one
 * applies. It does not here, because the inline script in `layout.tsx` has
 * already put the right class on `<html>` before this component ever mounts.
 * This effect is therefore reconciling React's state with a DOM that is already
 * correct, rather than driving the initial paint.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored && stored !== DEFAULT_THEME) setThemeState(stored);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    storeTheme(next);
    // Applied here rather than in an effect on `theme` so the DOM changes in
    // the same tick as the click. Through an effect, the toggle would visibly
    // lag its own press on a slow render.
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = nextTheme(current);
      storeTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * The active theme.
 *
 * Throws outside a provider rather than quietly defaulting: a toggle that
 * renders but silently controls nothing is far harder to notice than a crash
 * during development.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider.');
  return context;
}
