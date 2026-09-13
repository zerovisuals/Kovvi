/**
 * The annotated sample opportunity (brief §3.1).
 *
 * Static and deliberately so: it is an illustration of the mechanic, not a
 * screenshot of live data, and it says which. Showing a fabricated dashboard
 * and implying it is real output is the marketing equivalent of the dishonesty
 * the product is built to avoid.
 *
 * The annotations are the point. A prospecting tool's screenshot normally sells
 * volume; this one sells the fact that every line can be checked.
 */
export function AnnotatedSample() {
  return (
    <figure className="border-line-strong bg-card rounded-md border p-5 shadow-card">
      <figcaption className="text-2xs text-ink-faint mb-4 flex items-center gap-2 font-mono tracking-wide uppercase">
        <span aria-hidden className="hatch border-line-strong h-2.5 w-2.5 rounded-[1px] border" />
        Illustration · not live data
      </figcaption>

      {/* Identity */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-display text-lg font-semibold tracking-tight">
          Meridian Supply Co.
        </span>
        <span className="font-display text-lg font-medium tabular-nums" data-numeric>
          51
        </span>
      </div>

      <div className="text-2xs text-ink-faint mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
        <span>Porto</span>
        <span className="text-positive">✓ Confirmed site</span>
        <span>●●○ Medium</span>
      </div>

      <Annotation>
        The site is <em>confirmed</em>, not guessed — something links this domain back to the
        business.
      </Annotation>

      {/* Why now */}
      <div className="rule-t mt-5 pt-4">
        <p className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Why now</p>
        <p className="mt-1.5 text-sm">Autumn collection launched</p>
        <p className="text-ink-faint mt-1 font-mono text-2xs">11 days ago · discovered today</p>
      </div>

      <Annotation>
        Two dates, never one. An announcement from 2024 found this morning reads as two years old.
      </Annotation>

      {/* A claim with its source */}
      <div className="rule-t mt-5 pt-4">
        <p className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Evidence</p>
        <p className="mt-1.5 text-sm text-pretty">
          Product pages have no size information on mobile.
        </p>

        <span className="border-line text-ink-faint text-2xs mt-2 inline-flex items-baseline gap-1.5 rounded-xs border px-1.5 py-0.5 font-mono">
          <span aria-hidden>▸</span>
          <span>meridian-supply.test</span>
          <span aria-hidden className="opacity-60">
            ·
          </span>
          <span>2d ago</span>
          <span aria-hidden className="text-positive">
            ●●●
          </span>
        </span>
      </div>

      <Annotation>
        Every claim carries a chip like this. One click opens the quoted excerpt, the URL and the
        moment it was retrieved.
      </Annotation>

      {/* The honest part */}
      <div className="rule-t mt-5 pt-4">
        <p className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Not concluded</p>
        <p className="text-ink-muted mt-1.5 text-sm text-pretty">
          Whether this is costing them sales. We did not measure that, so we do not say it.
        </p>
      </div>

      <Annotation>
        The section most tools leave out. A guess presented as a finding is what makes outreach
        embarrassing to send.
      </Annotation>
    </figure>
  );
}

function Annotation({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-ink-faint border-line-strong mt-3 border-l-2 pl-3 text-xs text-pretty">
      {children}
    </p>
  );
}
