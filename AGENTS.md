<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Kovvi

A subscription tool for freelance web designers: it discovers businesses,
resolves their identities, gathers dated evidence, inspects their websites,
ranks opportunities against the designer's own portfolio, drafts outreach, and
tracks the resulting pipeline.

Read `docs/PRODUCT-BRIEF.md` for the product, and `BRAND-INTAKE.md` before
touching anything visual.

## The two rules that shape this codebase

**1. Honesty is structural, not conventional.**

The product's entire claim is that its evidence can be trusted. So the honesty
rules are enforced by things that cannot be forgotten, not by discipline:

- No nullable column ever means "absent". Facts that can be unknown carry
  `_state` / `_value` / `_reason` with a CHECK constraint. A missing directory
  field is never confirmed absence.
- `evidence.origin` has no `'llm'` value, so a model's output physically cannot
  be stored as evidence.
- `message.groundingEvidenceIds` is CHECK-constrained non-empty, so an
  ungrounded draft cannot exist.
- An unavailable integration is a rendered product state, never a simulated
  result. `src/server/capabilities/registry.ts` is the single source of truth,
  and `tests/guard/capability-honesty.test.ts` runs the whole pipeline with zero
  credentials to prove no faking path exists.
- `inconclusive` is a **success** terminal state in the pipeline, not a failure.
  Blocked crawls, absent capabilities and ambiguous identities all flow through
  it. Never convert uncertainty into a confident answer to make a screen look
  full.

When a screen looks empty, the fix is better copy for the empty state — not
inventing data.

**2. No brand values outside the swap point.**

`src/styles/theme.css` and `src/components/brand/` are the only places allowed
to name a colour, typeface, radius or duration. The stock Tailwind palette is
wiped (`--color-*: initial`), so `bg-blue-500` generates no utility at all.
`tests/guard/tokens.test.ts` fails the build on violations. The fix is
essentially never an exemption — add a semantic token and use it.

## Commands

```bash
pnpm db:server     # embedded Postgres (PGlite over the wire protocol) — run first
pnpm dev           # app; the job worker runs in-process
pnpm db:generate   # generate a migration after a schema change
pnpm db:migrate    # apply migrations
pnpm test          # vitest, including the guard suite
pnpm verify        # typecheck + lint + test + build — the gate
```

`KOVVI_DEV_ROUTES=1` enables `/tokens` (theme contract with live contrast
measurement) and `/states` (all fifteen required product states).

## Environment notes

- **Never run `playwright install`.** Chromium is pre-installed at
  `/opt/pw-browsers` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
- There is no Postgres server binary and no Docker daemon. `pnpm db:server`
  serves PGlite over the real Postgres wire protocol, so the app speaks plain
  `node-postgres` in every environment and dev/production DDL never diverges.
  PGlite is never imported by the web process.
