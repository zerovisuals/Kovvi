import type { ReactNode } from 'react';

/**
 * THE STATE PRIMITIVE
 *
 * The brief requires fifteen specific states, each with "recovery actions and
 * preserved useful work". All fifteen are built on this one component, and its
 * props are shaped so the requirement cannot be forgotten:
 *
 *   - `actions` is a NON-EMPTY tuple type. A state with no way forward will not
 *     compile. Dead ends are the failure mode this exists to prevent.
 *   - `whatWeKnow` is separate from `explanation`, because "we could not check"
 *     and "we checked and found nothing" must never read the same.
 *   - `preserved` describes work that survived, so a partial result is offered
 *     rather than discarded.
 *
 * Three variants, one component: a full `panel` where a region is empty, an
 * `inline` badge on a row in a list, and a `blocking` notice in campaign review
 * where the state prevents sending.
 */

export type StateAction = {
  readonly label: string;
  readonly href?: string;
  /** A form action; `href` and `onAction` are alternatives, not both. */
  readonly onAction?: () => void | Promise<void>;
  readonly primary?: boolean;
  /** Shown beneath the action when the consequence is not obvious. */
  readonly note?: string;
};

/** At least one action, enforced by the type. */
export type NonEmptyActions = readonly [StateAction, ...StateAction[]];

export type StateTone = 'neutral' | 'caution' | 'critical' | 'uncertain' | 'positive';

export type StatePanelProps = {
  readonly tone?: StateTone;
  readonly title: string;
  /** What happened, in plain language. */
  readonly explanation: string;
  /** What we can actually assert — deliberately separate from the explanation. */
  readonly whatWeKnow?: string;
  /** Work that survived and is still usable. */
  readonly preserved?: string;
  readonly actions: NonEmptyActions;
  readonly variant?: 'panel' | 'inline' | 'blocking';
  /** A short glyph. Status is never carried by colour alone. */
  readonly glyph?: string;
  readonly children?: ReactNode;
};

const TONE_TEXT: Record<StateTone, string> = {
  neutral: 'text-ink-muted',
  caution: 'text-caution',
  critical: 'text-critical',
  uncertain: 'text-uncertain',
  positive: 'text-positive',
};

const TONE_GLYPH: Record<StateTone, string> = {
  neutral: '·',
  caution: '!',
  critical: '✕',
  uncertain: '?',
  positive: '✓',
};

export function StatePanel({
  tone = 'neutral',
  title,
  explanation,
  whatWeKnow,
  preserved,
  actions,
  variant = 'panel',
  glyph,
  children,
}: StatePanelProps) {
  const mark = glyph ?? TONE_GLYPH[tone];

  if (variant === 'inline') {
    return (
      <span
        className="text-2xs inline-flex items-center gap-1.5 font-mono"
        data-state-tone={tone}
        title={explanation}
      >
        <span aria-hidden className={`${TONE_TEXT[tone]} font-semibold`}>
          {mark}
        </span>
        <span className="text-ink-muted">{title}</span>
      </span>
    );
  }

  if (variant === 'blocking') {
    return (
      <div
        role="status"
        data-state-tone={tone}
        className="border-line-strong bg-sunken rounded-md border p-4"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className={`${TONE_TEXT[tone]} mt-0.5 font-mono font-semibold`}>
            {mark}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-ink-muted mt-1 text-sm text-pretty">{explanation}</p>
            {whatWeKnow ? (
              <p className="text-ink-faint mt-1.5 text-xs text-pretty">{whatWeKnow}</p>
            ) : null}
            <ActionRow actions={actions} dense />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      role="status"
      data-state-tone={tone}
      className="mx-auto flex max-w-(--spacing-measure) flex-col items-start py-16"
    >
      <span aria-hidden className={`${TONE_TEXT[tone]} font-mono text-xl font-semibold`}>
        {mark}
      </span>

      <h2 className="font-display mt-4 text-xl font-semibold tracking-tight text-balance">
        {title}
      </h2>

      <p className="text-ink-muted mt-2 text-lg text-pretty">{explanation}</p>

      {whatWeKnow ? (
        <p className="text-ink-faint rule-t mt-5 pt-4 text-sm text-pretty">{whatWeKnow}</p>
      ) : null}

      {preserved ? (
        <p className="bg-sunken text-ink-muted mt-4 rounded-sm px-3 py-2 font-mono text-xs text-pretty">
          {preserved}
        </p>
      ) : null}

      {children}

      <ActionRow actions={actions} />
    </section>
  );
}

function ActionRow({ actions, dense = false }: { actions: NonEmptyActions; dense?: boolean }) {
  return (
    <div className={dense ? 'mt-3 flex flex-wrap gap-2' : 'mt-6 flex flex-wrap gap-2'}>
      {actions.map((action) => (
        <div key={action.label}>
          <ActionButton action={action} />
          {action.note ? (
            <p className="text-ink-faint mt-1 max-w-64 text-xs text-pretty">{action.note}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ActionButton({ action }: { action: StateAction }) {
  const className = action.primary
    ? 'bg-accent text-accent-ink ease-out inline-flex items-center rounded-sm px-3 py-1.5 text-sm font-medium transition-opacity duration-instant hover:opacity-90'
    : 'border-line-strong text-ink ease-out inline-flex items-center rounded-sm border px-3 py-1.5 text-sm transition-colors duration-instant hover:bg-sunken';

  if (action.href) {
    return (
      <a href={action.href} className={className}>
        {action.label}
      </a>
    );
  }

  return (
    <form action={action.onAction}>
      <button type="submit" className={className}>
        {action.label}
      </button>
    </form>
  );
}
