# Architecture

How Kovvi is put together, and why. This documents the decisions that are
load-bearing — the ones where a reasonable alternative exists and choosing it
would have cost something specific.

For what the product is, see the [README](../README.md). For the requirements,
see [the brief](./PRODUCT-BRIEF.md).

---

## 1. Layout

```
src/
  app/
    (marketing)/     landing, pricing            — expressive motion permitted
    (auth)/          sign in, sign up
    (app)/           the product                 — restrained motion only
    (dev)/           /tokens, /states            — gated on KOVVI_DEV_ROUTES
    api/             export, capture serving
  components/
    brand/           the two logo slots
    layout/ evidence/ opportunity/ outreach/ settings/ state/ sample/ discover/
  styles/            theme.css ★  fonts.ts ★  token-catalog.ts
  server/
    db/              client, tenant, schema/*, repo/*
    auth/ capabilities/ queue/ pipeline/ modules/ identity/ evidence/
    inspect/ rank/ draft/ outreach/ settings/ account/ billing/ email/
    storage/ seed/ ops/
  lib/
    net/             ssrf, safe-fetch
    untrusted/       the only path from fetched content to a model
    export/          csv
    theme.ts contrast.ts env.ts
  instrumentation.ts the in-process worker, development only
  proxy.ts           session cookie refresh ONLY
fixtures/sites/      the websites the seeder really inspects
tests/{setup,unit,acceptance,guard}
```

`(marketing)` and `(app)` are separate route groups because the brief gives them
different design rules. Making that a bundle boundary rather than a convention
means the restraint is enforced by what is reachable, not by memory.

`proxy.ts` (Next 16's replacement for `middleware.ts`) refreshes session cookies
and redirects signed-out visitors. It makes **no authorization decisions**: it
runs before routing, cannot see what a page will load, and a route reachable
another way would bypass it entirely. Authorization lives in
`src/server/auth/guards.ts` and in the repository layer, per query.

---

## 2. The database, and one driver everywhere

PGlite is WASM, and its documentation covers client-side bundling; Node server
use, Turbopack and `serverExternalPackages` are outside its documented scope. It
is also single-writer on a `dataDir`, so a dev server and a worker process
cannot share one. Embedding it would have been two risks at once.

Instead `@electric-sql/pglite-socket` runs PGlite as a **local server speaking
the Postgres wire protocol** (`pnpm db:server`). The app uses plain
`node-postgres` against `DATABASE_URL` in every environment — that server
locally, Neon or equivalent in production.

This removes the bundling risk, the single-writer problem, the HMR-singleton
hack and all dev/production DDL divergence in one move. `drizzle-kit
generate/migrate/studio` and `psql` all work normally, because what they see is
an ordinary Postgres. Tests use in-memory PGlite per file, for isolation and
speed.

> The server defaults to `maxConnections: 1`, which deadlocks a pool
> immediately. It is set to 32 in `scripts/db-server.ts`.

### Uncertainty as a schema pattern

There is no nullable "answer" column anywhere. Wherever a fact can be unknown:

```sql
<fact>_state   fact_state    -- 'known' | 'unknown' | 'conflicting'
<fact>_value   ...           -- meaningful ONLY when state = 'known'
<fact>_reason  fact_reason   -- not_searched | search_failed | blocked | no_evidence | ambiguous
CHECK ((state = 'known') = (value IS NOT NULL))
```

`conflicting` is not `unknown`: two irreconcilable answers is a different
finding from none. `not_searched` is not `no_evidence`: collapsing them is
exactly how "no website listed in this directory" becomes "has no website".

`uncertainCheck()` in `schema/columns.ts` generates the constraint, so a table
cannot declare the triple and forget the invariant that gives it meaning.

### Tenancy

`withTenant(ctx, fn)` returns a handle that ANDs `workspaceId` on every read and
injects it on every write for the tenant-private tables. Shared public tables —
businesses, source records, evidence — are reachable only through functions
shaped like `getEvidenceForOpportunity(ctx, oppId, evidenceId)`. There is
deliberately no `getEvidenceById(id)`, so cross-tenant isolation is a
type-system consequence first and a test second.

A schema-reflection guard fails the build if a table has `workspaceId` and no
entry in `TENANT_TABLES`.

Not-found is returned for anything a caller may not see, never "forbidden": a
response that distinguishes them confirms the record exists.

---

## 3. The pipeline

**The central decision: `inconclusive` is a success terminal state.**

```ts
type StageResult<O> =
  | { kind: 'ok'; output: O; evidence?: EvidenceDraft[]; next?: EnqueueSpec[] }
  | { kind: 'inconclusive'; reason: 'blocked' | 'timeout' | 'no_data' | 'source_unavailable' | 'ambiguous'; detail: string }
  | { kind: 'retry'; afterMs: number }
  | { kind: 'failed'; reason: string };   // → refund
```

Blocked crawls, absent capabilities and ambiguous
identities all flow through this one shape. That is why "partial results",
"source unavailable" and "unknown website" fall out of the architecture as
renderable states instead of being handled by conditionals scattered across
nine stages.

The stage vocabulary is `discover → normalize → resolve_identity →
collect_evidence → inspect_site → find_contacts → rank → draft → send`.

**Of these, only `inspect_site` is currently a queued stage** — it is the one
that is slow, expensive and worth metering. The rest run synchronously inside
the research and prepare flows against the same evidence and repository layer.
`registry.ts` registers stages explicitly rather than discovering them, so a
stage in the vocabulary with no registration is a loud error naming the file to
add, not a step that quietly does nothing.

Evidence is written at **claim level** with a source reference, so no summary
can become its own evidence.

### The queue

No Redis: the database is the queue. Claims use `FOR UPDATE SKIP LOCKED` with a
120-second lease and a reaper that requeues expired ones. Concurrency is 2 for
`inspect_site` and 4 elsewhere. The worker runs in-process via
`src/instrumentation.ts` in development, so `pnpm dev` drains the queue without
a second terminal, and as `scripts/worker.ts` in production. Both call the same
`createWorker`; production sets `KOVVI_EXTERNAL_WORKER=1`, which is the only
thing that keeps the in-process one from also starting.

> Claiming returns **ids only**, then re-selects through the query builder. A
> raw `RETURNING *` hands back snake_case keys, which silently become
> `undefined` on a camelCase type and then `NaN` in the usage ledger. Caught by
> the end-to-end pipeline test, not by the type checker.

### Budget

Reserve at enqueue → finalise once on success → refund on failure, each in the
same transaction as the job state change, with unique idempotency keys so a
retry or a webhook replay cannot double-charge. Balance is the sum of an
append-only ledger, never a mutated counter, and the billing screen shows every
movement — a balance you can see the arithmetic for can be explained.

Exceeding a run's cap marks jobs `cancelled_budget` and the run `capped`,
**keeping partial results**: a run that blows a budget and discards what it
found has wasted the money twice.

`inconclusive` **does** finalise. The work genuinely happened, and free blocked
inspections would be a denial-of-service vector. The billing screen names that
line item explicitly rather than burying it.

---

## 4. Capabilities

`src/server/capabilities/registry.ts` is the single source of truth, deriving
each capability's state from environment alone: `live`, `absent(no_credentials)`
or `disabled`. Each carries a `withoutIt` string
stating what is lost.

`requireCapability()` throws `CapabilityAbsentError`, which the stage runner
converts to `inconclusive('source_unavailable')` and server actions convert to a
typed result the UI renders as a designed state — never an exception page.

The **marketing page reads the same registry**, so the landing page cannot
advertise a channel the pipeline cannot use. That is not caution; a page
overstating what this particular product does would refute its own argument.

`tests/guard/capability-honesty.test.ts` runs the full pipeline with every
optional variable unset and asserts zero LLM-authored messages, zero send
attempts, `subscription.status = 'absent'`, and a real `httpStatus` and
`retrievedAt` on every source record. It was written early, before there was any
demo pressure to erode.

---

## 5. Security

### SSRF

One function, `assertPublicTarget(url)` in `lib/net/ssrf.ts`, shared by undici
**and** Playwright. HTTPS/HTTP and ports 80/443 only; DNS resolved first and
rejected if any address is loopback, private, link-local, CGNAT, multicast,
reserved, or a cloud metadata address; the validated IP is **pinned** through a
custom `lookup` in the agent, to defeat rebinding. Redirects are manual,
revalidated every hop, capped at 5, with the full chain recorded. 15-second
timeouts, a 2 MB HTML cap enforced by an aborting byte counter, and a bounded
crawl: depth ≤ 2, a capped page count per site, and limited concurrency per
host.

Loopback is permitted for fixtures only under `NODE_ENV === 'test'` or an
explicit escape hatch that **throws in production** — itself a test.

> `URL.hostname` keeps the brackets on an IPv6 literal, which then goes to DNS
> as `[::1]` and resolves to nothing. They are stripped before the check.

### The browser

A fresh context per assessment, `acceptDownloads: false`,
`serviceWorkers: 'block'`, dialogs auto-dismissed, a declared user agent
carrying a contact URL, and a 45-second total budget after which the result is
`inconclusive('timeout')`.

The real defence is `context.route('**/*')`, validating **every subresource**
through the same policy — page JavaScript can request anything, and a policy
applied only to the top-level navigation is not a policy. Forms are never
submitted and orders are never placed; contact-route detection is structural,
never behavioural.

> Two environment traps worth knowing. Chromium ignores `NODE_EXTRA_CA_CERTS`,
> and an intercepting proxy that cannot carry a TLS 1.3 handshake fails every
> real inspection while the plain-HTTP fixture tests pass — so the failure is
> masked. `--ssl-version-max=tls1.2` is applied only when a proxy is configured
> and throws in production. Separately, esbuild's `keepNames` helper travels
> into the browser through Playwright's source serialization, so every
> `page.evaluate` dies with `__name is not defined` until an identity shim is
> installed via `addInitScript`.

### Untrusted content

Everything fetched is `trustLevel: 'untrusted_web'`. The only path to a model is
`lib/untrusted/wrap.ts`, which strips scripts, truncates, and wraps the content
in a delimited envelope stating that instructions inside are content to be
reported rather than followed. A detector flags injection attempts, writes an
audit event, and the opportunity detail shows a visible note that the page tried
to instruct an automated reader and was ignored. Evidence extraction continues
regardless — a page trying to manipulate us is not a reason to stop reading it.

### CSV

RFC 4180 quoting; cells beginning `=`, `+`, `-`, `@`, tab or CR prefixed with
`'`; control characters stripped; a `data_origin` column always present so
sample rows stay identifiable outside the UI. The values in these cells were
written by strangers, and in a spreadsheet a leading `=` is a program.

---

## 6. Outreach

Preparation, approval and dispatch are three separate steps with three separate
guarantees.

**Preparing** (`server/outreach/prepare.ts`) is where most refusals happen, so
the result reports them individually rather than as a count: "9 of 14 prepared"
with no explanation reads as a bug, while naming the five reasons turns the same
outcome into information about the user's prospects. `campaignEligibility()` is
the one function consulted here, on the review screen, and again inside the
dispatch transaction — three slightly different copies of a check will
eventually disagree, and the disagreement is discovered by a recipient.

Note what eligibility does **not** take: the score. Nothing is unblocked by
ranking well.

**Drafting** (`server/draft/template.ts`) is deterministic and is not a degraded
mode; it is the honest floor. It quotes written assessment findings, never raw
evidence excerpts — an excerpt is whatever the page contained, usually
navigation text and an address, and quoting someone's own page back at them is
the most recognisable tell of automated outreach. It checks an event against its
own type's freshness window rather than the retrieval's, because a page fetched
this morning can mention a 1987 opening. Everything it declines to say is
reported as a stated omission beside the draft.

`auditDraft()` checks the **output** for guarantees, promised percentages and
unauthorised discounts. Checking output rather than trusting the generator
matters more once an LLM is connected, because a model will reach for exactly
that language.

**Approval** is per message version, by hash. Editing writes a new body hash and
the stored approval stops matching — there is no flag anyone has to remember to
clear. The review screen distinguishes "you approved an earlier version" from
"never approved", because those mean different things to someone who thought
they had signed this off.

**Sending** compares hashes, checks for a reply, and checks suppression, inside
one transaction. A reply or opt-out cancels every pending follow-up in the same
transaction that records it: split across two statements, a crash between them
leaves follow-ups armed, and following up with someone who already answered is
the fastest way to look automated in the worst sense.

Replies are never classified automatically. A polite brush-off reads a great
deal like interest to a classifier, and a wrong guess sends the freelancer
chasing the conversations that were never going anywhere.

---

## 7. The theme contract

Three tiers in `src/styles/theme.css`, the only file permitted a colour literal,
a font name, a radius or a duration:

1. **Raw values.** The block a designer replaces wholesale.
2. **Semantic assignment.** The same token names defined for light and dark.
3. **Utility generation**, via `@theme inline`.

Tier 3 **must** be `@theme inline`. Plain `@theme` resolves at build time, which
would bake tier 2's light values into the utilities and make `[data-theme=dark]`
inert. Tier 3 also opens with `--color-*: initial`, so the stock Tailwind palette
is gone entirely and `bg-blue-500` generates no utility at all — the convention
is enforced by absence.

Because every duration is a token, one `prefers-reduced-motion` block that zeroes
`--kv-dur-*` makes the whole product respect the setting.

> Tier-3 tokens are declared only at `:root` and inherit unchanged into a themed
> subtree. Anything measuring a token's computed value — `/tokens` does, for
> contrast ratios — must read the **tier-2** variable the utility actually
> resolves to, or the dark column will silently duplicate the light one.

`next/font/local` throws at build time if the file is missing, which would make
an unbranded repository unbuildable. `src/styles/fonts.ts` therefore exports a
stable shape with the real `localFont()` calls written out and commented.
Enabling a typeface is: drop the `.woff2` in, uncomment four lines.

---

## 8. Verification

`pnpm verify` = typecheck → eslint → vitest (unit, acceptance and guard) →
`next build`.

- `tests/acceptance/ac01..ac15` — one file per case in the brief.
- `tests/guard/tokens.test.ts` — no brand decision outside the swap point.
- `tests/guard/capability-honesty.test.ts` — nothing is faked with all optional
  env unset.
- Tenant-scoping guard — no new table escapes `TENANT_TABLES`.

Case 12's billing leg asserts an **honest absence**: with no payment provider
configured there is no subscription to cancel and the product says exactly that.
A stubbed "cancelled" would be the precise dishonesty the brief forbids.

Cases 6 and 7 exercise their LLM and send halves through test doubles injected
at the adapter interface. That is legitimate testing, and distinct from shipping
a simulated integration — which the capability-honesty guard separately proves
the shipped code cannot do.

Visual work is not verifiable by typechecking. `scripts/shot.ts` screenshots a
running page and reports what the browser complained about; four defects in this
repository were found only that way, and three drafting defects were found only
by reading real seeded output.

---

## 9. Deployment

Vercel plus any Postgres. Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, and
`KOVVI_EXTERNAL_WORKER=1`, then run `pnpm worker` as a separate process — the
in-process worker is a development convenience, not a serverless strategy. Set
the S3 variables too: the filesystem blob store is not durable on a serverless
host, and screenshots are evidence.

Everything else stays unset until there is a real credential for it, which the
product will report accurately in the meantime.
