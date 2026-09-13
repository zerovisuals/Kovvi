import { StatePanel } from './StatePanel';

/**
 * A screen that does not exist yet.
 *
 * Deliberately blunt, and deliberately NOT dressed up with placeholder rows or
 * greyed-out skeletons. A product whose thesis is that its evidence can be
 * trusted cannot have screens that imply functionality they do not have, and
 * the same rule that forbids simulating an absent integration forbids
 * simulating an absent screen.
 *
 * Every one of these is replaced by a real screen before launch.
 */
export function NotBuiltYet({
  what,
  plannedFor,
  instead,
}: {
  readonly what: string;
  /** Which build phase delivers it, so the gap is scheduled rather than vague. */
  readonly plannedFor: string;
  /** What the user can do in the meantime, if anything. */
  readonly instead?: { readonly label: string; readonly href: string };
}) {
  return (
    <StatePanel
      tone="neutral"
      glyph="◌"
      title={`${what} is not built yet`}
      explanation={`This screen is scheduled for ${plannedFor}. It is empty rather than filled with placeholder data, because a screen that looks functional and is not is worse than an obviously unfinished one.`}
      whatWeKnow="Nothing here is simulated. What the product can genuinely do today is listed under Connections."
      actions={
        instead
          ? [
              { label: instead.label, href: instead.href, primary: true },
              { label: 'See what works today', href: '/settings/connections' },
            ]
          : [{ label: 'See what works today', href: '/settings/connections', primary: true }]
      }
    />
  );
}
