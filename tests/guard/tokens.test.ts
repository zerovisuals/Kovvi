import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE TOKEN GUARD
 *
 * Kovvi's visual identity is supplied by the designer after the structure is
 * built, so every brand decision has to live behind a single swap point. That
 * only holds if it is enforced. This test walks the source tree and fails on
 * any hardcoded colour, typeface, radius or duration outside the two files
 * allowed to carry them.
 *
 * If this test fails, the fix is essentially never to add an exemption — it is
 * to add a semantic token to `src/styles/theme.css` and use that instead.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');

/** The only files permitted to name a raw visual value. */
const ALLOWED = [
  join('src', 'styles', 'theme.css'),
  join('src', 'styles', 'fonts.ts'),
  join('src', 'components', 'brand') + sep,
];

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css'];

const STOCK_PALETTE = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
].join('|');

type Rule = { readonly name: string; readonly pattern: RegExp; readonly fix: string };

const RULES: readonly Rule[] = [
  {
    name: 'hex colour literal',
    pattern: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g,
    fix: 'Use a semantic colour token (bg-card, text-ink-muted, border-line…).',
  },
  {
    name: 'colour function literal',
    pattern: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\s*\(/g,
    fix: 'Define the value in theme.css tier 1 and reference the token.',
  },
  {
    name: 'stock Tailwind palette utility',
    pattern: new RegExp(
      String.raw`\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|shadow|accent|caret)-(?:${STOCK_PALETTE})-\d{2,3}\b`,
      'g',
    ),
    fix: 'The stock palette is deliberately wiped. Use a Kovvi semantic token.',
  },
  {
    name: 'arbitrary colour value',
    pattern: /\[#[0-9a-fA-F]{3,8}\]/g,
    fix: 'Arbitrary colours bypass the swap point. Add a token instead.',
  },
  {
    // Naming a typeface is a brand decision; pointing at a font token is not.
    name: 'raw font-family declaration',
    // The lookahead must swallow the whitespace itself; `\s*(?!var\()` would
    // simply backtrack to zero spaces and match anyway.
    pattern: /font-family\s*:(?!\s*var\()/g,
    fix: 'Use the font-display / font-sans / font-mono utilities, or var(--font-*).',
  },
  {
    // Same reasoning: `var(--duration-quick)` is the contract, `260ms` is not —
    // a literal would survive the reduced-motion override in theme.css.
    name: 'literal transition or animation duration',
    pattern: /(?:transition-duration|animation-duration)\s*:(?!\s*var\()\s*[\d.]+m?s/g,
    fix: 'Use duration-quick / duration-calm / duration-slow so reduced-motion works.',
  },
  {
    name: 'arbitrary duration utility',
    pattern: /\b(?:duration|delay)-\[[^\]]+\]/g,
    fix: 'Use a duration token; reduced-motion is disabled by zeroing the tokens.',
  },
  {
    name: 'numeric Tailwind duration utility',
    pattern: /\b(?:duration|delay)-\d+\b/g,
    fix: 'Use duration-instant / duration-quick / duration-calm / duration-slow.',
  },
];

function isAllowed(relativePath: string): boolean {
  return ALLOWED.some((allowed) =>
    allowed.endsWith(sep) ? relativePath.startsWith(allowed) : relativePath === allowed,
  );
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Strips comments so that prose explaining a rule ("never write #fff") does not
 * trip the rule it explains. Deliberately simple: it does not attempt to honour
 * strings containing comment-like sequences, which would only ever cause this
 * guard to scan more than it must.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) =>
      // Preserve the newline count so reported line numbers stay accurate —
      // a guard nobody can locate the violation in is a guard nobody fixes.
      '\n'.repeat((comment.match(/\n/g) ?? []).length),
    )
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('token guard', () => {
  const files = walk(SRC);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('has no hardcoded brand values outside the swap point', () => {
    const violations: string[] = [];

    for (const file of files) {
      const relativePath = relative(ROOT, file);
      if (isAllowed(relativePath)) continue;

      const source = stripComments(readFileSync(file, 'utf8'));
      const lines = source.split('\n');

      for (const rule of RULES) {
        lines.forEach((line, index) => {
          const matches = line.match(rule.pattern);
          if (!matches) return;
          for (const match of matches) {
            violations.push(
              `${relativePath}:${index + 1}  ${rule.name} — "${match.trim()}"\n      ${rule.fix}`,
            );
          }
        });
      }
    }

    expect(
      violations,
      violations.length === 0
        ? ''
        : `\nBrand values must live in src/styles/theme.css.\n\n${violations.join('\n')}\n`,
    ).toEqual([]);
  });

  it('keeps the swap point where the intake sheet says it is', () => {
    const theme = readFileSync(join(SRC, 'styles', 'theme.css'), 'utf8');

    // The stock palette must stay wiped, or a stray `bg-blue-500` would silently
    // work and the guard above would be the only thing standing between a
    // supplied identity and a half-Tailwind one.
    expect(theme).toContain('--color-*: initial');

    // Tier 3 must be `inline`, otherwise tier 2's light values get baked into
    // the utilities at build time and dark mode silently stops working.
    expect(theme).toContain('@theme inline');
  });
});
