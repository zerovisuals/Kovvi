/**
 * Sample-data markers.
 *
 * Sample-ness is a fact at the data layer — `workspace.kind` and
 * `data_origin` — and these make it visible. Both use a hatch pattern and a
 * text label as well as colour, because a colour-only marker disappears for
 * colour-blind users and in print, and "is this real?" is exactly the question
 * a user must never have to guess at.
 */

export function SampleBanner() {
  return (
    <div
      role="note"
      className="rule-b bg-sunken flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2"
    >
      <span
        aria-hidden
        className="hatch border-line-strong h-3.5 w-3.5 shrink-0 rounded-xs border"
      />
      <p className="text-2xs font-mono tracking-wide uppercase">Sample workspace</p>
      <p className="text-ink-muted text-xs text-pretty">
        These organizations are invented. The evidence, screenshots and timestamps are real
        retrievals of fixture sites, so the workflow behaves exactly as it would with your own
        research — but nothing here describes a real business.
      </p>
    </div>
  );
}
