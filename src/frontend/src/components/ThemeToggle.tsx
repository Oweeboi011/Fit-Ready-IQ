'use client';

import { Moon, Sun } from 'lucide-react';

import { buttonGhost, buttonSize } from '@/lib/ui';

import { useTheme } from './ThemeProvider';

/**
 * Switches between the dark and light themes.
 *
 * `buttonGhost`, because changing the theme is a setting — it is never the
 * action we most want someone to take on a screen, and the one primary
 * treatment per viewport belongs to whatever is.
 *
 * The icon shows the theme you would switch *to*, which is the convention
 * people already read from every other app: a sun means "go light". The
 * accessible name says so explicitly, since an icon alone is ambiguous about
 * whether it depicts the current state or the destination.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const goingTo = theme === 'dark' ? 'light' : 'dark';
  const Icon = theme === 'dark' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // Not aria-pressed: this is not a toggle that stays "on", it is a control
      // that swaps between two named states, and the label carries which.
      aria-label={`Switch to ${goingTo} theme`}
      title={`Switch to ${goingTo} theme`}
      className={`${buttonGhost} ${buttonSize.sm} ${className}`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
