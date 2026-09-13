/**
 * Row-level sample marker.
 *
 * Uses a hatch pattern and a text label as well as colour, because a
 * colour-only marker disappears for colour-blind users and in print — and
 * "is this a real business?" is a question the user must never have to guess at.
 */
export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={[
        'text-2xs border-line-strong text-ink-muted inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 font-mono tracking-wide uppercase',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title="An invented organization. The evidence and screenshots are real retrievals of a fixture site."
    >
      <span aria-hidden className="hatch h-2 w-2 rounded-[1px]" />
      Sample
    </span>
  );
}
