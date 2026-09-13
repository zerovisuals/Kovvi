/**
 * The theme contract, described as data.
 *
 * This is what `/tokens` renders and what a designer checks a supplied palette
 * against. It holds only token NAMES and the pairings that must stay legible —
 * never values, which live exclusively in `src/styles/theme.css`.
 *
 * ── Why entries carry a `cssVar` as well as a `utility` ───────────────────
 * Tier 3 is declared with `@theme inline`, which inlines the VALUE EXPRESSION
 * into the generated utility: `bg-card` compiles to
 * `background-color: var(--kv-surface-card)`, not `var(--color-card)`. That is
 * precisely what makes runtime theme switching work — and it means the tier-3
 * name is the wrong thing to measure. Tier-3 variables are declared only at
 * `:root`, so their computed value is substituted there and then INHERITS
 * unchanged into a `[data-theme="dark"]` subtree; probing one would report the
 * light value in both columns.
 *
 * So `cssVar` names the tier-2 variable that the utility actually resolves to,
 * and everything measured or swatched on this page goes through it.
 */

export type TokenEntry = {
  /** What components write, e.g. `bg-card`. */
  readonly utility: string;
  /** The tier-2 variable the utility resolves to. Measured and swatched. */
  readonly cssVar: string;
  readonly role: string;
};

export type TokenGroup = {
  readonly title: string;
  readonly note: string;
  readonly tokens: readonly TokenEntry[];
};

export const COLOR_GROUPS: readonly TokenGroup[] = [
  {
    title: 'Surfaces',
    note: 'Four depths. The app leans on hairline rules and spacing rather than stacked cards, so these stay close together.',
    tokens: [
      { utility: 'bg-page', cssVar: '--kv-surface-page', role: 'Application and page ground' },
      { utility: 'bg-card', cssVar: '--kv-surface-card', role: 'Raised content: rows, panels, dossiers' },
      { utility: 'bg-sunken', cssVar: '--kv-surface-sunken', role: 'Recessed: toolbars, code, capture frames' },
      { utility: 'bg-raised', cssVar: '--kv-surface-raised', role: 'Floating: popovers, dialogs, command palette' },
      { utility: 'bg-inverse', cssVar: '--kv-surface-inverse', role: 'Inverted blocks and marketing sections' },
    ],
  },
  {
    title: 'Ink',
    note: 'Three weights of text plus an inverse. Anything below tertiary would fail contrast at the 11px metadata size.',
    tokens: [
      { utility: 'text-ink', cssVar: '--kv-ink-primary', role: 'Primary text and headings' },
      { utility: 'text-ink-muted', cssVar: '--kv-ink-secondary', role: 'Secondary text, labels, descriptions' },
      { utility: 'text-ink-faint', cssVar: '--kv-ink-tertiary', role: 'Metadata, timestamps, provenance chips' },
      { utility: 'text-ink-inverse', cssVar: '--kv-ink-inverse', role: 'Text on inverse surfaces' },
    ],
  },
  {
    title: 'Rules',
    note: 'Hairlines do most of the compositional work in the application. They need to be visible without becoming a grid of boxes.',
    tokens: [
      { utility: 'border-line', cssVar: '--kv-line-hairline', role: 'Default hairline separators' },
      { utility: 'border-line-strong', cssVar: '--kv-line-strong', role: 'Emphasis rules, input borders, focus containers' },
    ],
  },
  {
    title: 'Accent',
    note: 'One accent only. It marks the primary action and the current selection — never decoration.',
    tokens: [
      { utility: 'bg-accent', cssVar: '--kv-accent', role: 'Primary action, active state' },
      { utility: 'text-accent-ink', cssVar: '--kv-accent-ink', role: 'Text and icons on the accent' },
      { utility: 'bg-accent-weak', cssVar: '--kv-accent-weak', role: 'Selected rows, subtle accent fills' },
    ],
  },
  {
    title: 'Signals',
    note: 'These carry meaning, so they must stay mutually distinguishable — including for colour-blind viewers. Every status is ALSO encoded by glyph, weight and label, so the product still reads correctly if these are unset.',
    tokens: [
      { utility: 'text-positive', cssVar: '--kv-sig-positive', role: 'Confirmed identity, working commercial journey' },
      { utility: 'text-caution', cssVar: '--kv-sig-caution', role: 'Probable identity, ageing evidence, partial coverage' },
      { utility: 'text-critical', cssVar: '--kv-sig-critical', role: 'Objective defect, failed send, identity conflict' },
      { utility: 'text-uncertain', cssVar: '--kv-sig-uncertain', role: 'Inconclusive, blocked, unknown — the honest middle' },
      { utility: 'text-sample', cssVar: '--kv-sig-sample', role: 'Sample data, always paired with a hatch and a label' },
    ],
  },
];

/**
 * Pairings that must pass WCAG contrast, named by their tier-2 variables for
 * the reason explained at the top of this file.
 *
 * `minimum` is 4.5 for body text and 3.0 where WCAG permits it — large text
 * (our 22px+ steps) and non-text boundaries such as rules and focus rings.
 */
export type ContrastPair = {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
  readonly usage: string;
};

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { foreground: '--kv-ink-primary', background: '--kv-surface-page', minimum: 4.5, usage: 'Body text on page' },
  { foreground: '--kv-ink-primary', background: '--kv-surface-card', minimum: 4.5, usage: 'Body text in rows and panels' },
  { foreground: '--kv-ink-primary', background: '--kv-surface-sunken', minimum: 4.5, usage: 'Text in toolbars and capture frames' },
  { foreground: '--kv-ink-secondary', background: '--kv-surface-page', minimum: 4.5, usage: 'Secondary text on page' },
  { foreground: '--kv-ink-secondary', background: '--kv-surface-card', minimum: 4.5, usage: 'Secondary text in panels' },
  { foreground: '--kv-ink-tertiary', background: '--kv-surface-card', minimum: 4.5, usage: 'Provenance metadata at 11px' },
  { foreground: '--kv-ink-tertiary', background: '--kv-surface-sunken', minimum: 4.5, usage: 'Metadata in toolbars' },
  { foreground: '--kv-ink-inverse', background: '--kv-surface-inverse', minimum: 4.5, usage: 'Text on inverse blocks' },
  { foreground: '--kv-accent-ink', background: '--kv-accent', minimum: 4.5, usage: 'Primary button label' },
  { foreground: '--kv-ink-primary', background: '--kv-accent-weak', minimum: 4.5, usage: 'Text on a selected row' },
  { foreground: '--kv-line-strong', background: '--kv-surface-page', minimum: 3, usage: 'Input borders and emphasis rules' },
  { foreground: '--kv-focus-ring', background: '--kv-surface-page', minimum: 3, usage: 'Keyboard focus ring' },
  { foreground: '--kv-sig-positive', background: '--kv-surface-card', minimum: 3, usage: 'Positive status marker' },
  { foreground: '--kv-sig-caution', background: '--kv-surface-card', minimum: 3, usage: 'Caution status marker' },
  { foreground: '--kv-sig-critical', background: '--kv-surface-card', minimum: 3, usage: 'Critical status marker' },
  { foreground: '--kv-sig-uncertain', background: '--kv-surface-card', minimum: 3, usage: 'Inconclusive status marker' },
  { foreground: '--kv-sig-sample', background: '--kv-surface-card', minimum: 3, usage: 'Sample-data marker' },
];

export const TYPE_STEPS: readonly { readonly name: string; readonly usage: string }[] = [
  { name: 'text-2xs', usage: '11px — provenance chips, table metadata' },
  { name: 'text-xs', usage: '12px — labels, badges, keyboard hints' },
  { name: 'text-sm', usage: '13px — dense table body' },
  { name: 'text-base', usage: '15px — application body' },
  { name: 'text-lg', usage: '17px — reading measure, evidence excerpts' },
  { name: 'text-xl', usage: '22px — section titles' },
  { name: 'text-2xl', usage: '30px — page titles' },
  { name: 'text-3xl', usage: '44px — marketing headings' },
  { name: 'text-4xl', usage: '64px — marketing hero' },
];

export const FONT_SLOTS: readonly {
  readonly token: string;
  readonly utility: string;
  readonly usage: string;
}[] = [
  {
    token: '--kv-font-display-supplied',
    utility: 'font-display',
    usage: 'Page titles, run headers, marketing headlines, typeset figures',
  },
  {
    token: '--kv-font-text-supplied',
    utility: 'font-sans',
    usage: 'Body copy, labels, table content — the workhorse',
  },
  {
    token: '--kv-font-mono-supplied',
    utility: 'font-mono',
    usage: 'Evidence metadata: source chips, timestamps, confidence, URLs, IDs',
  },
];

export const MOTION_TOKENS: readonly { readonly name: string; readonly usage: string }[] = [
  { name: '--kv-dur-instant', usage: 'hover, press, focus' },
  { name: '--kv-dur-quick', usage: 'row selection, disclosure, tab change' },
  { name: '--kv-dur-calm', usage: 'panel entry, route transition' },
  { name: '--kv-dur-slow', usage: 'marketing only' },
];

export const RADIUS_TOKENS: readonly { readonly name: string; readonly usage: string }[] = [
  { name: '--kv-radius-xs', usage: 'Chips, keyboard hints, focus outlines' },
  { name: '--kv-radius-sm', usage: 'Buttons, inputs, rows' },
  { name: '--kv-radius-md', usage: 'Panels, cards, popovers' },
  { name: '--kv-radius-lg', usage: 'Dialogs, capture frames, marketing blocks' },
  { name: '--kv-radius-full', usage: 'Avatars and pills' },
];
