import { Wordmark } from '@/components/brand/Wordmark';

/**
 * Placeholder landing page. The real one (brief §3.1) is built in phase 8 and
 * reads the live capability registry, so it can never overstate what is
 * actually connected.
 */
export default function LandingPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-(--spacing-measure) flex-col px-6">
      <header className="rule-b flex items-center py-6">
        <Wordmark height={18} />
      </header>

      <div className="flex flex-1 flex-col justify-center py-24">
        <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight text-balance">
          Discover organizations that fit your work.
        </h1>
        <p className="text-ink-muted mt-4 text-lg text-pretty">
          Get the evidence, contact and approach prepared.
        </p>
        <p className="text-ink-faint mt-10 font-mono text-2xs tracking-wide uppercase">
          Structure under construction · identity not yet supplied
        </p>
      </div>
    </main>
  );
}
