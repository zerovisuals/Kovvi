import Link from 'next/link';

/**
 * A one-line, workspace-wide notice.
 *
 * Deliberately compact. The full explanation of an absent subscription or a
 * disconnected account belongs on the screen that can fix it; repeating a
 * six-line panel above every page would train the user to scroll past exactly
 * the notices that matter. This states the fact and points at the fix.
 */
export function AppBanner({
  tone = 'neutral',
  glyph = '·',
  message,
  action,
}: {
  readonly tone?: 'neutral' | 'caution' | 'critical' | 'uncertain';
  readonly glyph?: string;
  readonly message: string;
  readonly action: { readonly label: string; readonly href: string };
}) {
  const toneClass = {
    neutral: 'text-ink-muted',
    caution: 'text-caution',
    critical: 'text-critical',
    uncertain: 'text-uncertain',
  }[tone];

  return (
    <div
      role="status"
      className="rule-b bg-sunken flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2 md:px-10"
    >
      <span aria-hidden className={`${toneClass} font-mono text-xs`}>
        {glyph}
      </span>
      <p className="text-ink-muted min-w-0 text-xs text-pretty">{message}</p>
      <Link
        href={action.href}
        className="text-ink ease-out text-xs underline underline-offset-4 transition-opacity duration-instant hover:opacity-70"
      >
        {action.label}
      </Link>
    </div>
  );
}
