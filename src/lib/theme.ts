/**
 * Three-state theme: `light`, `dark`, or unset meaning "follow the system".
 *
 * `data-theme` on <html> is always resolved to a concrete `light`/`dark` value
 * before first paint, which keeps the Tailwind `dark:` variant a single simple
 * selector (see the `@custom-variant` at the bottom of theme.css) instead of a
 * three-way media-query-plus-attribute construction.
 */

export const THEME_STORAGE_KEY = 'kovvi.theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Runs synchronously in <head> to prevent a flash of the wrong theme.
 * Kept dependency-free and defensive: storage access throws in some privacy
 * modes, and a theme failure must never block the page from rendering.
 */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var resolved = (stored === 'light' || stored === 'dark')
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`.trim();

/** Reads the stored preference. Returns 'system' when unset or unreadable. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/* ── External store ────────────────────────────────────────────────────────
   The preference lives in localStorage and on the documentElement, not in
   React. Exposing it as a real external store lets components read it with
   `useSyncExternalStore` instead of an effect-then-setState dance, and means a
   change in another tab propagates for free.
   ────────────────────────────────────────────────────────────────────────── */

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing the preference writes to localStorage, which fires
  // `storage` here.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export const getThemeSnapshot = readThemePreference;

/** The server cannot know a client preference, so it renders the neutral one. */
export function getThemeServerSnapshot(): ThemePreference {
  return 'system';
}

/** Persists a preference and applies it immediately. */
export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const resolved: ResolvedTheme =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;

  document.documentElement.setAttribute('data-theme', resolved);

  try {
    if (preference === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // A theme preference that cannot be persisted still applies for this page.
  }

  notify();
  return resolved;
}
