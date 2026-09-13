/**
 * PLACEHOLDER WORDMARK — replace this file with the supplied logo.
 *
 * It is type-set rather than drawn on purpose: an unset identity should read as
 * unset, not as a design decision someone has to argue with later.
 *
 * ── Replacement contract ──────────────────────────────────────────────────
 * Keep the component name, the props, and `currentColor`. Everything that
 * renders a wordmark in the app and on the marketing site imports this one
 * component, so a correct replacement changes nothing else.
 *
 *   • Use `fill="currentColor"` — the mark inherits ink from its context and
 *     therefore works unchanged in light, dark, and on inverse surfaces.
 *   • Set `viewBox` to the artwork's own box; the height prop drives size and
 *     the width follows from the aspect ratio.
 *   • Include `<title>` for assistive technology.
 *
 * See BRAND-INTAKE.md.
 */
export function Wordmark({
  height = 20,
  className,
  title = 'Kovvi',
}: {
  height?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={['font-display inline-flex items-center leading-none', className]
        .filter(Boolean)
        .join(' ')}
      style={{ fontSize: height, letterSpacing: '-0.02em' }}
      role="img"
      aria-label={title}
      data-placeholder-brand="wordmark"
    >
      <span aria-hidden="true" className="font-semibold">
        Kovvi
      </span>
    </span>
  );
}
