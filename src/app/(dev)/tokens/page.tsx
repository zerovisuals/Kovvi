import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { TokenInspector } from './TokenInspector';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Wordmark } from '@/components/brand/Wordmark';
import { hasSuppliedFonts } from '@/styles/fonts';
import { devRoutesEnabled } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Theme contract',
  robots: { index: false, follow: false },
};

/**
 * The handover review surface.
 *
 * Everything a designer supplies — palette, typefaces, radii, motion — can be
 * checked here in one screen, in both themes, with contrast measured live
 * rather than assumed. Gated on KOVVI_DEV_ROUTES so it never ships to users.
 */
export default async function TokensPage() {
  // `connection()` opts this page out of static prerendering, so the env gate
  // is evaluated per request. Without it Next would bake the build-time value
  // in and the route would 404 forever regardless of how the server is run.
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
          <span className="text-ink-muted text-sm">Theme contract</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="max-w-(--spacing-measure) pb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
          Every brand decision, in one place.
        </h1>
        <p className="text-ink-muted mt-3 text-lg text-pretty">
          Kovvi&rsquo;s identity is supplied, not invented. Each value below lives in a single file,{' '}
          <code className="font-mono text-sm">src/styles/theme.css</code>, and everything else in the
          product references it by role. Replace that file and the product changes with it.
        </p>
        <p className="text-ink-faint mt-4 text-sm text-pretty">
          The placeholders are a neutral greyscale with no design intent — they exist so the
          application renders before an identity exists. See{' '}
          <code className="font-mono text-xs">BRAND-INTAKE.md</code> for what to supply and where it
          goes.
        </p>
      </div>

      <TokenInspector fontsSupplied={hasSuppliedFonts} />
    </main>
  );
}
