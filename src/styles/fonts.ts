/**
 * KOVVI TYPEFACE SLOTS
 *
 * ── Why this file looks like this ─────────────────────────────────────────
 * `next/font/local` throws at BUILD time if the file it points at is missing.
 * Declaring the real faces up front would therefore make an unbranded checkout
 * unbuildable. Instead each slot exports a stable `{ variable }` shape that is
 * empty until a font actually exists, and `src/styles/theme.css` falls back to
 * a system stack through `var(--kv-font-*-supplied, <system stack>)`.
 *
 * ── To enable a real typeface ─────────────────────────────────────────────
 *   1. Drop the `.woff2` files into `public/fonts/`.
 *   2. Uncomment the matching `localFont({...})` call below and delete the
 *      `ABSENT` line above it.
 *   3. Nothing else changes. `layout.tsx` already spreads `fontClassNames`.
 *
 * Variable fonts are assumed (`weight: '300 800'`). For static cuts, give one
 * entry per weight in the `src` array. See BRAND-INTAKE.md.
 */

// import localFont from 'next/font/local';

/** The shape every slot conforms to, supplied or not. */
type FontSlot = { variable: string };

const ABSENT: FontSlot = { variable: '' };

/**
 * DISPLAY — page titles, run headers, marketing headlines, and every figure
 * that should read as typeset rather than tabulated.
 */
export const display: FontSlot = ABSENT;
// export const display = localFont({
//   src: [{ path: '../../public/fonts/kovvi-display.woff2', weight: '300 800', style: 'normal' }],
//   variable: '--kv-font-display-supplied',
//   display: 'swap',
//   fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
//   adjustFontFallback: false,
// });

/** TEXT — body copy, form labels, table content. The workhorse. */
export const text: FontSlot = ABSENT;
// export const text = localFont({
//   src: [{ path: '../../public/fonts/kovvi-text.woff2', weight: '300 700', style: 'normal' }],
//   variable: '--kv-font-text-supplied',
//   display: 'swap',
//   fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
//   adjustFontFallback: false,
// });

/**
 * MONO — load-bearing, not decorative. Every piece of evidence metadata is set
 * in it: source chips, retrieval timestamps, confidence labels, URLs, IDs.
 * Needs good digits and an unambiguous 0/O and 1/l/I.
 */
export const mono: FontSlot = ABSENT;
// export const mono = localFont({
//   src: [{ path: '../../public/fonts/kovvi-mono.woff2', weight: '400 600', style: 'normal' }],
//   variable: '--kv-font-mono-supplied',
//   display: 'swap',
//   fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
//   adjustFontFallback: false,
// });

/** Spread onto `<html>`. Empty strings fall out, so an unbranded build is clean. */
export const fontClassNames: string = [display.variable, text.variable, mono.variable]
  .filter(Boolean)
  .join(' ');

/** True once at least one real typeface is wired up. Surfaced at /tokens. */
export const hasSuppliedFonts: boolean = fontClassNames.length > 0;
