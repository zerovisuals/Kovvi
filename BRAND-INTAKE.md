# Brand intake

Kovvi's structure is built; its identity is yours to supply. This is the sheet
for handing it over.

Everything visual routes through **one file**, `src/styles/theme.css`, plus two
logo components and a font declaration. Nothing else in the codebase names a
colour, a typeface, a radius or a duration — `tests/guard/tokens.test.ts` fails
the build if anything tries. So a complete handover touches four places and
changes the entire product.

**Review what you supply at `/tokens`.** Run `KOVVI_DEV_ROUTES=1 pnpm dev` and
open <http://localhost:3000/tokens>. It renders every token in both themes and
measures the contrast of each pairing live, by painting the colour and reading
the pixel back — so composed and translucent values are reported exactly as
they will render.

---

## 1. References — start here

Drop anything you like into `design-references/`: screenshots, exports, video
captures, links in a text file, moodboards, competitor teardowns. Annotated is
better than clean; a note saying *why* a reference is here is worth more than
the image.

This folder is gitignored by default, since references are often large and
sometimes third-party material. Remove the line from `.gitignore` if they
should be versioned with the project.

References are read with the `design-zrecreate` skill, which works through what
is actually visible — spacing, optical corrections, easing, state changes — and
reconstructs the reasoning before writing code. **Supply them as they exist,
rather than saving them all for the end**; each one that arrives early shapes
structure instead of having to be retrofitted onto it.

---

## 2. Colour

Replace the **TIER 1** block at the top of `src/styles/theme.css`. That is the
only block you need to touch; tiers 2 and 3 map your values onto roles and
generate the utilities, and are already written.

Any palette is accepted — the *roles* are what is fixed:

| Tokens | What they are | Notes |
| --- | --- | --- |
| `--kv-n-0` … `--kv-n-10` | Neutral ramp, lightest to darkest | Eleven steps. Dark mode reads the same ramp from the other end, so it needs to work inverted. |
| `--kv-a-base`, `--kv-a-ink`, `--kv-a-weak` | The single accent, its text colour, and a tint | `-weak` backs selected rows, so text must stay readable on it. |
| `--kv-sig-positive` | Confirmed identity, working commercial journey | |
| `--kv-sig-caution` | Probable identity, ageing evidence, partial coverage | |
| `--kv-sig-critical` | Objective defect, failed send, identity conflict | |
| `--kv-sig-uncertain` | Inconclusive, blocked, unknown | The honest middle. Product-defining; give it a real identity rather than treating it as a greyed-out state. |
| `--kv-sig-sample` | Sample data | Always paired with a hatch pattern and a text label. |

Three things worth knowing before you choose:

- **One accent only.** It marks the primary action and the current selection.
  The application is a reading surface for evidence; a second accent competes
  with the content.
- **The five signal hues carry meaning and must stay mutually
  distinguishable**, including under the common colour-vision deficiencies.
  They are never the sole carrier of a status — every one is also encoded by
  glyph, weight, rule style and text label — so the product stays correct if
  they are indistinguishable. That is a floor, not a reason to skip the check.
- **Dark mode is a true inversion**, not a tinted light mode. Check both
  columns at `/tokens`.

The current values are neutral greyscale placeholders with no design intent.
The accent is deliberately grey so that an unset identity looks unset.

## 3. Typefaces

Drop `.woff2` files into `public/fonts/`, then open `src/styles/fonts.ts` and
uncomment the matching block. Four lines each. Nothing else changes.

| Slot | Utility | Carries |
| --- | --- | --- |
| Display | `font-display` | Page titles, run headers, marketing headlines, typeset figures |
| Text | `font-sans` | Body copy, labels, table content — the workhorse |
| Mono | `font-mono` | **Load-bearing.** Every piece of evidence metadata: source chips, retrieval timestamps, confidence labels, URLs, IDs |

Notes:

- Variable fonts are assumed (`weight: '300 800'`). For static cuts, add one
  `src` entry per weight — the file shows the shape.
- **Mono is not decorative here.** It sets the provenance chips at 11px, so it
  needs good digits and an unambiguous `0/O` and `1/l/I`.
- The text face is read at 13–15px in dense tables for long stretches. Optical
  sizing or a text-optimised cut earns its keep.
- Until files exist, each slot falls back to a system stack. `next/font/local`
  throws at build time on a missing file, which is why the declarations ship
  commented rather than pointing at files that are not there yet.

The type scale itself — nine steps from 11px to 64px — lives in tier 3 of
`theme.css` and is visible at `/tokens`. Change the steps there if your face
wants a different rhythm.

## 4. Logo

Two components, both currently placeholders:

- `src/components/brand/Wordmark.tsx` — the full wordmark.
- `src/components/brand/Mark.tsx` — the small-size symbol, used in the
  collapsed navigation rail and as the favicon.

Replace the contents; keep the component names and props. Every surface in the
app and on the marketing site imports these two, so a correct replacement
changes nothing else.

There is a third file, `src/app/icon.svg`, which is the favicon. It must match
the `Mark` visually but cannot use `currentColor` — a favicon has no inherited
colour context — so it is the one place outside `theme.css` that carries
explicit colour values. Replace it at the same time as the `Mark`.

- Use `fill="currentColor"` throughout the two components. The marks then
  inherit ink from their context and work unchanged in light, dark and on
  inverse surfaces — which is also the monochrome version the brief asks for,
  for free.
- `Mark` must stay legible at **16px**. Check it in the rail, not just in
  isolation.
- Keep the `<title>` element for assistive technology.

## 5. Geometry and motion

Also tier 1, also swappable:

- **Radii** — five steps, `--kv-radius-xs` through `--kv-radius-full`.
- **Durations** — `--kv-dur-instant` (90ms), `-quick` (150ms), `-calm` (260ms),
  `-slow` (420ms, marketing only).
- **Easing** — `--kv-ease-out`, `--kv-ease-in-out`, `--kv-ease-spring`.

Because every animation in the codebase reads a duration token rather than a
literal, the `prefers-reduced-motion` block at the bottom of `theme.css`
disables all motion in the product by redefining four variables. Keep it that
way: a hardcoded duration would survive it, which is why the guard test rejects
one.

---

## What the structure already assumes

These are load-bearing decisions the identity should amplify rather than fight.
If a reference implies changing one, say so — they are choices, not laws.

- **Hairline rules over boxes.** The application composes with rules, spacing
  and typographic hierarchy rather than stacked cards. Surfaces sit close
  together deliberately.
- **A persistent evidence rail** on detail views, not a drawer. The brief
  requires source inspection within one interaction of a claim, and a rail that
  is always there is what delivers it.
- **Provenance chips are the signature element.** A small mono chip carrying
  `source · retrieved · confidence` attached to every factual claim, expanding
  in place. It is the product's thesis made visible, and the one component
  worth being genuinely beautiful.
- **Status is never colour alone.** Glyph, weight, rule style and label carry
  it; colour reinforces.
- **Tabular numerals everywhere a figure appears**, so columns compare.
- **Determinate progress only.** No indeterminate spinner exists in the
  product; research runs show their real stage and counts.
