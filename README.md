# Kovvi

Prospecting for freelance web designers, built so that every claim it makes can
be checked.

Kovvi discovers organizations across seven industry modules, resolves who they
actually are, gathers dated evidence of commercial events, inspects their
websites in a real browser, finds publicly listed contacts, ranks the result
against the freelancer's own confirmed portfolio, drafts outreach grounded in
what was found, and tracks the resulting pipeline.

The category is full of tools that are confident. This one is checkable.

---

## The constraint everything else follows from

Prospecting software is under constant pressure to fill a screen. A blank result
looks broken; a shorter list looks like a worse product. The usual resolution is
to guess — infer an email from a name pattern, describe a two-year-old
announcement as news, call a blocked crawl a defect — and every one of those
guesses is eventually sent to a real business with the freelancer's name on it.

So Kovvi's honesty rules are **structural, not conventional**. Discipline does
not hold under demo pressure; enum values that do not exist do.

| The rule | How it is enforced |
|---|---|
| A model's summary can never become evidence | `evidence.origin` is `'extractor' \| 'adapter' \| 'user'`. There is no `'llm'`, so there is nowhere to put such a row. |
| A `NULL` never means "absent" | Every uncertain fact is a `(state, value, reason)` triple with `CHECK ((state='known') = (value IS NOT NULL))`. `not_searched` and `no_evidence` are different values. |
| An outreach message must cite something real | `CHECK array_length(grounding_evidence_ids, 1) >= 1`. A draft that cites nothing cannot be stored. |
| Approval covers one exact text | Dispatch compares `message.body_hash` against the stored `approved_body_hash`. Editing invalidates approval by arithmetic, not by clearing a flag. |
| A blocked crawl is inconclusive, not a finding | `inconclusive` is a **success** terminal state in the pipeline, beside `ok` — not beside `failed`. `deriveFindings` returns `[]` for any inconclusive outcome as its first action. |
| Unsupported integrations are absent, not simulated | One capability registry derives every integration's state from env alone. A guard test runs the whole pipeline with all optional env unset and asserts nothing was faked. |
| A colour, font or duration cannot leak into a component | A guard test fails the build on hex literals, colour functions, stock Tailwind palette names and literal durations outside `src/styles/theme.css`. |

Two of these caught real violations in this repository's own first commit.

---

## Running it

Requires Node 20.9+ and pnpm. No Postgres install, no Docker.

```bash
pnpm install
cp .env.example .env.local          # then set AUTH_SECRET
pnpm db:server                      # terminal 1 — PGlite over the Postgres wire protocol
pnpm db:migrate                     # terminal 2
pnpm dev
```

Then sign up at http://localhost:3000/sign-up and seed the sample workspace:

```bash
pnpm db:seed you@example.com
```

Nothing in `.env.example` below the database section is required. Every
capability that is not configured shows up in the product as a named absence,
which is the point rather than a limitation.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | App, with the job worker in-process |
| `pnpm db:server` | Serves the embedded database over the Postgres wire protocol |
| `pnpm db:generate` / `db:migrate` / `db:studio` | Drizzle migrations and browser |
| `pnpm db:seed <email>` | Builds the sample workspace by running the real pipeline |
| `pnpm worker` | The job worker as its own process (production) |
| `pnpm verify` | typecheck → eslint → vitest → `next build` |
| `pnpm tsx scripts/shot.ts <url> <out.png> [theme]` | Screenshots a running page and reports what the browser complained about |

### The sample workspace

Every organization in it is invented. Everything *about* them is real: the
seeder starts a local server, serves fixture websites from it, and runs the
actual pipeline against them — real HTTP retrievals with real status codes and
content hashes, real Playwright screenshots at real viewport sizes, real dates
parsed from real markup at their real precision, real drafts from the real
drafter.

That is what makes it worth having. The blocked fixture genuinely produces an
inconclusive assessment with no findings, because it genuinely refuses us. The
two same-named fixtures genuinely produce an unresolved identity conflict, which
genuinely costs one of the drafts.

Sample-ness is a fact at the data layer (`workspace.kind`, `data_origin`,
exported as a CSV column), not a label in the UI, so a real workspace's queries
exclude it structurally.

---

## What is built

**Working with zero setup.** Email/password auth; manual URL and CSV import;
real public page retrieval behind a pinned-IP SSRF policy; real website
inspection (desktop and mobile captures, redirect chains, navigation crawl,
purchase and contact route detection, external provider detection); real public
contact extraction; identity resolution by cross-link verification;
deterministic grounded drafting; ranking; campaign review and approval; manual
send logging; conversations; outcomes; CSV export; deletion; a usage ledger; an
audit log the user can read.

**Coded, tested against a fake, shipped switched off.** AI-assisted drafting,
web-search discovery, transactional email sending, Stripe billing, S3 capture
storage. Each names what is lost without it, in the place where it matters.

**Modules.** Seven declared with filters, evidence rules and coverage
statements. Local services and fashion/ecommerce are fully built with benchmark
cases; the other five share the same evidence and inspection machinery and say
so on the setup screen rather than quietly returning nothing.

**States.** All fifteen from the brief exist as reachable, recoverable screens,
built on one primitive whose type makes the recovery actions non-empty — so a
dead-end state will not compile.

### What it does not do

It does not bring you clients. It does not score businesses against each other
in any calibrated sense — rankings are a starting heuristic, comparable within
an industry rather than across them. It does not send anything you have not
read and approved; there is no autopilot toggle anywhere in the product, and
editing an approved message revokes the approval.

---

## Branding

The visual identity is deliberately absent and **prepared for**, not missing.
See [`BRAND-INTAKE.md`](./BRAND-INTAKE.md): a palette, three typefaces and two
logo components drop into named slots with no refactor. `src/styles/theme.css`
is the only file in the repository permitted a colour literal, a font name, a
radius or a duration, and a guard test keeps it that way.

With `KOVVI_DEV_ROUTES=1`, `/tokens` renders every semantic token in both themes
with live contrast measurement, and `/states` renders all fifteen product states
in all three variants — so a supplied palette can be checked before it is
committed.

---

## Further reading

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how the pieces fit, and why
  each load-bearing decision was made
- [`docs/PRODUCT-BRIEF.md`](./docs/PRODUCT-BRIEF.md) — the original brief
- [`BRAND-INTAKE.md`](./BRAND-INTAKE.md) — what to supply, in what format
