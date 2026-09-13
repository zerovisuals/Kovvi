import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { resolveAllCapabilities } from '@/server/capabilities/registry';
import { MODULES } from '@/server/modules/registry';
import { STATE_DEFINITIONS } from '@/components/state/states';
import { HEURISTIC_NOTE } from '@/server/rank/score';
import { AnnotatedSample } from '@/components/marketing/AnnotatedSample';

export const metadata: Metadata = {
  title: 'Kovvi — discover organizations that fit your work',
  description:
    'Find businesses you can credibly help, with the evidence, the contact and the approach already prepared. Every claim carries its source.',
};

/**
 * THE LANDING PAGE
 *
 * It reads the live capability registry, so it cannot advertise a channel the
 * pipeline cannot use. That is not caution — it is the product's actual
 * argument. Everything else in this category promises leads; the one thing
 * Kovvi can promise is that what it tells you is true, and a landing page that
 * overstated would refute itself.
 *
 * Hence the section most pages do not have: what this does NOT do.
 */
export default async function LandingPage() {
  // Capability state comes from the environment, so this page is per-request.
  // Prerendering would bake in whatever the build machine had configured.
  await connection();

  const capabilities = resolveAllCapabilities();
  const live = capabilities.filter((capability) => capability.status.state === 'live');
  const absent = capabilities.filter((capability) => capability.status.state !== 'live');
  const built = MODULES.filter((entry) => entry.built);

  return (
    <main id="main">
      {/* ── Promise ─────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pt-20 pb-16 md:px-10 md:pt-32 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-start lg:gap-16">
        <div>
          <p className="text-ink-faint font-mono text-2xs tracking-wide uppercase">
            For freelance web designers
          </p>

          <h1 className="font-display mt-6 text-3xl leading-[1.05] font-semibold tracking-tight text-balance md:text-4xl">
            Discover organizations that fit your work.
          </h1>

          <p className="text-ink-muted mt-6 max-w-(--spacing-measure) text-lg text-pretty md:text-xl">
            Get the evidence, the contact and the approach prepared. Every claim carries the page it
            came from, so you can check it in one click — and so can they.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="bg-accent text-accent-ink ease-out inline-flex h-11 items-center rounded-sm px-5 text-sm font-medium transition-opacity duration-instant hover:opacity-90"
            >
              Start researching
            </Link>
            <Link
              href="/pricing"
              className="border-line-strong ease-out inline-flex h-11 items-center rounded-sm border px-5 text-sm transition-colors duration-instant hover:bg-sunken"
            >
              €65/month · see what that includes
            </Link>
          </div>

          <p className="text-ink-faint mt-6 max-w-(--spacing-measure) text-sm text-pretty">
            Outbound is still outbound. Kovvi does the research and prepares the approach; you
            decide who to write to and what to say.
          </p>
        </div>

        {/* The mechanic, shown rather than described — and labelled as an
            illustration, because a fabricated dashboard passed off as output is
            the marketing form of the dishonesty this product exists to avoid. */}
        <AnnotatedSample />
      </section>

      {/* ── The argument ────────────────────────────────────────────────── */}
      <section className="rule-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
          <h2 className="font-display max-w-3xl text-2xl font-semibold tracking-tight text-balance">
            Most prospecting tools are confident. This one is checkable.
          </h2>

          <div className="mt-12 grid gap-10 md:grid-cols-3">
            <Argument
              index="01"
              title="Every claim shows its source"
              body="A chip against each fact opens the quoted excerpt, the URL and the moment it was retrieved. You are never asked to take a finding on trust, because the thing you send has your name on it."
            />
            <Argument
              index="02"
              title="It says when it does not know"
              body="A site that blocked our reader produces an inconclusive result with no findings — not a list of invented defects. A directory with a blank website field means the field is blank, not that the business has no website."
            />
            <Argument
              index="03"
              title="It refuses to guess"
              body="No invented email addresses. No claiming a rebrand you cannot point at. No describing a two-year-old announcement as news. Where the evidence stops, so does the product."
            />
          </div>
        </div>
      </section>

      {/* ── What it actually does ───────────────────────────────────────── */}
      <section className="rule-t">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            What happens when you run a search
          </h2>

          <ol className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Step
              n={1}
              title="Find"
              body="Candidates from the sources you have connected, plus any URLs you import yourself. Sources that could not answer are named, so a short list is never mistaken for a complete one."
            />
            <Step
              n={2}
              title="Verify"
              body="Who the business actually is, and which domain is really theirs. Two businesses sharing a name are flagged rather than merged, and outreach is blocked until you resolve it."
            />
            <Step
              n={3}
              title="Inspect"
              body="The confirmed site is loaded in a real browser, on desktop and on a phone, and captured. A working Shopify checkout is a functioning commercial route, not a missing one."
            />
            <Step
              n={4}
              title="Prepare"
              body="A short draft grounded in what was actually found, citing your own confirmed work. You approve every recipient and every message before anything is sent."
            />
          </ol>
        </div>
      </section>

      {/* ── What it does NOT do ─────────────────────────────────────────── */}
      <section className="rule-t bg-sunken">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            What this does not do
          </h2>
          <p className="text-ink-muted mt-3 max-w-(--spacing-measure) text-pretty">
            Read this before the feature list. It is the more useful half.
          </p>

          <ul className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
            <Limit title="It does not bring you clients">
              A lead is not a client. An observed issue is not demonstrated revenue loss. An active
              business is not a funded buyer. Kovvi reduces the hours; the conversation is yours.
            </Limit>
            <Limit title="It does not score businesses against each other">
              Rankings are a starting heuristic, not a probability of winning the work, and they are
              comparable within an industry rather than across them. {HEURISTIC_NOTE}
            </Limit>
            <Limit title={`${MODULES.length - built.length} of ${MODULES.length} industries are declared, not built`}>
              {built.map((entry) => entry.label).join(' and ')} have tuned assessment rules and
              benchmark cases. The rest share the same evidence and inspection machinery but have no
              rules of their own yet, and each says so on the setup screen.
            </Limit>
            <Limit title="It does not send anything you have not approved">
              You see the actual recipient list and the exact message body. There is no autopilot
              toggle anywhere in the product. Editing an approved message revokes the approval.
            </Limit>
          </ul>
        </div>
      </section>

      {/* ── Live capabilities ───────────────────────────────────────────── */}
      <section className="rule-t">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            What is connected right now
          </h2>
          <p className="text-ink-muted mt-3 max-w-(--spacing-measure) text-pretty">
            This table is generated from the running system, not written by hand. If something here
            says &ldquo;not connected&rdquo;, the product genuinely will not do it — and will tell
            you so in the place it matters rather than failing quietly.
          </p>

          <div className="mt-10 grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="text-2xs text-positive font-mono tracking-wide uppercase">
                ● Working now — no setup
              </h3>
              <ul className="rule-t mt-3">
                {live.map((capability) => (
                  <li key={capability.id} className="rule-b py-3">
                    <p className="text-sm font-medium">{capability.label}</p>
                    <p className="text-ink-muted mt-0.5 text-sm text-pretty">
                      {capability.provides}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-2xs text-uncertain font-mono tracking-wide uppercase">
                ○ Needs a key you supply
              </h3>
              <ul className="rule-t mt-3">
                {absent.map((capability) => (
                  <li key={capability.id} className="rule-b py-3">
                    <p className="text-sm font-medium">{capability.label}</p>
                    <p className="text-ink-faint mt-0.5 text-sm text-pretty">
                      Without it: {capability.withoutIt}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── States ──────────────────────────────────────────────────────── */}
      <section className="rule-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
          <h2 className="font-display max-w-3xl text-2xl font-semibold tracking-tight text-balance">
            {STATE_DEFINITIONS.length} ways of saying &ldquo;not yet&rdquo;, written properly
          </h2>
          <p className="text-ink-muted mt-3 max-w-(--spacing-measure) text-pretty">
            Research tools spend most of their time in partial states. Each of these distinguishes{' '}
            <em>we could not check</em> from <em>we checked and found nothing</em>, says what
            survived, and offers a way forward.
          </p>

          <ul className="mt-10 flex flex-wrap gap-2">
            {STATE_DEFINITIONS.map((state) => (
              <li
                key={state.key}
                className="border-line text-ink-muted rounded-sm border px-3 py-1.5 font-mono text-2xs"
              >
                {state.title}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Close ───────────────────────────────────────────────────────── */}
      <section className="rule-t">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10">
          <h2 className="font-display max-w-3xl text-3xl font-semibold tracking-tight text-balance">
            Spend the afternoon designing, not searching.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="bg-accent text-accent-ink ease-out inline-flex h-11 items-center rounded-sm px-5 text-sm font-medium transition-opacity duration-instant hover:opacity-90"
            >
              Start researching
            </Link>
          </div>
          <p className="text-ink-faint mt-5 max-w-(--spacing-measure) text-sm text-pretty">
            A sample workspace is included so you can see the whole workflow before pointing it at
            anything real. The organizations in it are invented; the evidence, screenshots and
            timestamps are genuine retrievals.
          </p>
        </div>
      </section>
    </main>
  );
}

function Argument({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div className="rule-t pt-5">
      <span className="text-ink-faint font-mono text-2xs">{index}</span>
      <h3 className="font-display mt-2 text-lg font-medium tracking-tight">{title}</h3>
      <p className="text-ink-muted mt-2 text-pretty">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="rule-t pt-5">
      <span className="text-ink-faint font-mono text-2xs">{String(n).padStart(2, '0')}</span>
      <h3 className="font-display mt-2 text-lg font-medium tracking-tight">{title}</h3>
      <p className="text-ink-muted mt-2 text-sm text-pretty">{body}</p>
    </li>
  );
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <h3 className="font-display text-lg font-medium tracking-tight text-balance">{title}</h3>
      <p className="text-ink-muted mt-2 max-w-(--spacing-measure) text-sm text-pretty">{children}</p>
    </li>
  );
}
