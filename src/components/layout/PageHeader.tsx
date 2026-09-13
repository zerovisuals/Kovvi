import type { ReactNode } from 'react';

/**
 * The page frame used by every app screen.
 *
 * `lede` is not decoration: several of these screens present uncertain
 * information, and a line explaining what the numbers do and do not mean is
 * part of showing evidence honestly rather than a nicety.
 */
export function PageHeader({
  title,
  lede,
  actions,
  meta,
}: {
  readonly title: string;
  readonly lede?: string;
  readonly actions?: ReactNode;
  /** Small monospace facts: counts, timestamps, coverage. */
  readonly meta?: ReactNode;
}) {
  return (
    <header className="rule-b px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          {lede ? (
            <p className="text-ink-muted mt-2 max-w-(--spacing-measure) text-lg text-pretty">
              {lede}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>

      {meta ? (
        <div className="text-ink-faint mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-2xs">
          {meta}
        </div>
      ) : null}
    </header>
  );
}

/** Standard content padding, matching the header's gutters. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="px-6 py-8 md:px-10">{children}</div>;
}
