'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  THEME_PREFERENCES,
  applyThemePreference,
  getThemeServerSnapshot,
  getThemeSnapshot,
  subscribeToTheme,
  type ThemePreference,
} from '@/lib/theme';

const LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/**
 * Three-state theme control.
 *
 * The preference lives in localStorage and on the documentElement rather than
 * in React, so it is read as a genuine external store. That also makes a change
 * in another tab propagate without any extra wiring.
 */
export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );

  // While following the system, track OS-level changes without a reload.
  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemePreference('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="border-line-strong bg-card inline-flex rounded-sm border p-0.5"
    >
      {THEME_PREFERENCES.map((option) => {
        const selected = preference === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => applyThemePreference(option)}
            className={`ease-out text-2xs rounded-xs px-2.5 py-1 font-mono tracking-wide uppercase transition-colors duration-instant ${
              selected ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
