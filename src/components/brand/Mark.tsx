/**
 * PLACEHOLDER SYMBOL — replace this file with the supplied small-size mark.
 *
 * This is the mark that appears in the collapsed navigation rail, the favicon,
 * and anywhere the full wordmark will not fit. The brief (§3) asks for a
 * small-size symbol and monochrome versions; `currentColor` gives the
 * monochrome requirement for free.
 *
 * ── Replacement contract ──────────────────────────────────────────────────
 *   • Draw inside a square `viewBox`; `size` sets both dimensions.
 *   • `fill="currentColor"` only — no baked colour, so it works on page, card
 *     and inverse surfaces without a second asset.
 *   • It must stay legible at 16px. Test it at that size in the rail before
 *     considering it done.
 *
 * See BRAND-INTAKE.md.
 */
export function Mark({
  size = 24,
  className,
  title = 'Kovvi',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
      data-placeholder-brand="mark"
    >
      <title>{title}</title>
      {/* Placeholder geometry: an open square with a notch, chosen to be
          obviously provisional rather than quietly acceptable. */}
      <rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8.5 16.5V7.5M8.5 12.25L15 7.5M8.5 12.25L15 16.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
