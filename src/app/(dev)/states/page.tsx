import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { StatePanel } from '@/components/state/StatePanel';
import { STATE_DEFINITIONS } from '@/components/state/states';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Wordmark } from '@/components/brand/Wordmark';
import { devRoutesEnabled } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Product states',
  robots: { index: false, follow: false },
};

/**
 * All fifteen required states, in all three variants, in one place.
 *
 * This is both the design handoff surface and the coverage check: the brief
 * names fifteen states, and this page renders exactly the definitions the app
 * renders, so a state cannot be quietly forgotten or drift from what users see.
 */
export default async function StatesPage() {
  // Without `connection()` Next prerenders the env gate at build time and the
  // route 404s permanently, whatever the server is later configured with.
  await connection();
  if (!devRoutesEnabled()) notFound();

  return (
    <main id="main" className="mx-auto max-w-5xl px-6 pb-32">
      <header className="flex flex-wrap items-center justify-between gap-4 py-8">
        <div className="flex items-center gap-3">
          <Wordmark height={16} />
          <span className="text-ink-faint" aria-hidden>
            /
          </span>
          <span className="text-ink-muted text-sm">Product states</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="max-w-(--spacing-measure) pb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
          Fifteen ways to say &ldquo;not yet&rdquo; honestly.
        </h1>
        <p className="text-ink-muted mt-3 text-lg text-pretty">
          Empty states are where a research product&rsquo;s honesty actually shows. Each of these
          distinguishes <em>we could not check</em> from <em>we checked and found nothing</em>, names
          what survived, and offers a way forward — the last one enforced by the type system rather
          than by review.
        </p>
        <p className="text-ink-faint mt-4 font-mono text-2xs tracking-wide uppercase">
          {STATE_DEFINITIONS.length} states · panel, inline and blocking variants
        </p>
      </div>

      {STATE_DEFINITIONS.map((definition) => (
        <section key={definition.key} className="border-line-strong border-t py-10">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <code className="font-mono text-sm">{definition.key}</code>
            <p className="text-ink-faint font-mono text-2xs">
              {definition.appearsIn.join(' · ')}
            </p>
          </div>

          <p className="text-ink-muted bg-sunken mb-8 rounded-sm px-3 py-2 font-mono text-xs text-pretty">
            Trigger: {definition.trigger}
          </p>

          <div className="border-line rounded-md border">
            <StatePanel
              tone={definition.tone}
              glyph={definition.glyph}
              title={definition.title}
              explanation={definition.explanation}
              whatWeKnow={definition.whatWeKnow}
              preserved={definition.preserved}
              actions={definition.actions}
            />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-ink-faint mb-2 font-mono text-2xs tracking-wide uppercase">
                Inline — on a row
              </p>
              <div className="border-line rule-b flex h-(--spacing-row) items-center gap-3 rounded-sm border px-3">
                <span className="text-sm">Meridian Supply Co.</span>
                <StatePanel
                  tone={definition.tone}
                  glyph={definition.glyph}
                  title={definition.title}
                  explanation={definition.explanation}
                  actions={definition.actions}
                  variant="inline"
                />
              </div>
            </div>

            <div>
              <p className="text-ink-faint mb-2 font-mono text-2xs tracking-wide uppercase">
                Blocking — in campaign review
              </p>
              <StatePanel
                tone={definition.tone}
                glyph={definition.glyph}
                title={definition.title}
                explanation={definition.explanation}
                whatWeKnow={definition.whatWeKnow}
                actions={definition.actions}
                variant="blocking"
              />
            </div>
          </div>
        </section>
      ))}
    </main>
  );
}
