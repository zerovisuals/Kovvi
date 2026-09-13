import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * The marketing frame.
 *
 * A separate route group from the application because the brief gives them
 * different rules: marketing may use expressive motion and a wide canvas, the
 * app must stay restrained and dense. Keeping them apart makes that a boundary
 * rather than a convention.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-page flex min-h-dvh flex-col">
      <header className="rule-b sticky top-0 z-20 bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4 md:px-10">
          <Link href="/" className="inline-flex">
            <Wordmark height={18} />
          </Link>

          <nav className="flex items-center gap-5" aria-label="Marketing">
            <Link href="/pricing" className="text-ink-muted hover:text-ink text-sm">
              Pricing
            </Link>
            <Link href="/sign-in" className="text-ink-muted hover:text-ink text-sm">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="bg-accent text-accent-ink ease-out inline-flex h-9 items-center rounded-sm px-3.5 text-sm font-medium transition-opacity duration-instant hover:opacity-90"
            >
              Start
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="rule-t mt-auto">
        <div className="text-ink-faint mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 font-mono text-2xs md:px-10">
          <span>Kovvi</span>
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
