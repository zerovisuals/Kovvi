/**
 * WCAG contrast measurement for live theme tokens.
 *
 * Tokens are authored in modern colour spaces and can be composed with
 * `color-mix`, so the only reliable way to learn a token's final sRGB value is
 * to let the browser paint it. Every resolver here routes through a 1×1 canvas
 * for exactly that reason — it means a supplied palette is measured as it will
 * actually render, not as we guess it parses.
 */

export type Rgb = readonly [r: number, g: number, b: number];

/** WCAG 2.1 relative luminance. Input channels are 0–255. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1–21. Order of arguments does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Composites a possibly-translucent colour over an opaque backdrop, which is
 * what the eye actually sees. Hairline rules are deliberately translucent, so
 * measuring them without this would report a contrast nobody experiences.
 */
export function compositeOver(foreground: Rgb, alpha: number, backdrop: Rgb): Rgb {
  return [
    Math.round(foreground[0] * alpha + backdrop[0] * (1 - alpha)),
    Math.round(foreground[1] * alpha + backdrop[1] * (1 - alpha)),
    Math.round(foreground[2] * alpha + backdrop[2] * (1 - alpha)),
  ];
}

export type ResolvedColor = { readonly rgb: Rgb; readonly alpha: number; readonly css: string };

/** Paints a CSS colour string and reads the result back. Browser-only. */
export function paintAndRead(css: string): ResolvedColor | null {
  // Validate before painting. An unparseable value leaves `fillStyle` at its
  // default and would otherwise be reported as an opaque black, which is a
  // plausible-looking wrong answer rather than a visible failure.
  if (typeof CSS !== 'undefined' && !CSS.supports('color', css)) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.clearRect(0, 0, 1, 1);
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);

  const data = context.getImageData(0, 0, 1, 1).data;
  const [r, g, b, a] = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 255];
  return { rgb: [r, g, b], alpha: a / 255, css };
}

/**
 * Reads a CSS custom property from an element and resolves it to sRGB.
 * `element` decides which theme applies, so the same token can be measured in
 * light and dark by passing containers with different `data-theme` values.
 */
export function resolveToken(element: Element, token: string): ResolvedColor | null {
  const raw = getComputedStyle(element).getPropertyValue(token).trim();
  if (!raw) return null;
  return paintAndRead(raw);
}

export type ContrastVerdict = 'pass' | 'fail';

export function verdictFor(ratio: number, minimum: number): ContrastVerdict {
  return ratio >= minimum ? 'pass' : 'fail';
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}
