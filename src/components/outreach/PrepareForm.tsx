'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { prepareOutreach, type PrepareActionResult } from '@/server/outreach/actions';

export type PreparableRow = {
  readonly id: string;
  readonly organization: string;
  readonly region: string | null;
  readonly totalScore: number;
  readonly stage: string;
  readonly blockedReason: string | null;
};

/**
 * Choosing who to prepare outreach for.
 *
 * Selection is explicit and per-row. There is no "select all matching" and no
 * saved rule that keeps preparing — the brief's "no autopilot" requirement is
 * not only about sending, and a control that silently grows a batch over time
 * is an autopilot with extra steps.
 *
 * Blocked rows stay visible and selectable-looking right up to the point of
 * refusal, and the refusal explains itself. Hiding them would leave the user
 * wondering where an organization went.
 */
export function PrepareForm({ rows }: { readonly rows: readonly PreparableRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [name, setName] = useState('');
  const [result, setResult] = useState<PrepareActionResult | null>(null);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const outcome = await prepareOutreach(name, [...selected]);
      setResult(outcome);
      if (outcome.ok && outcome.campaignId) {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-ink-muted max-w-(--spacing-measure) text-sm text-pretty">
        Nothing is waiting to be prepared. Opportunities appear here once a research run has
        shortlisted them.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
            Campaign name
          </span>
          <input
            value={name}
            onChange={(fired) => setName(fired.target.value)}
            placeholder="Porto retailers, September"
            className="border-line-strong bg-page mt-1.5 block h-9 w-72 rounded-sm border px-2.5 text-sm"
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0}
          className="bg-accent text-accent-ink ease-out inline-flex h-9 items-center rounded-sm px-4 text-sm font-medium transition-opacity duration-instant hover:opacity-90 disabled:opacity-40"
        >
          {pending
            ? 'Drafting…'
            : `Draft ${selected.size || 'no'} message${selected.size === 1 ? '' : 's'}`}
        </button>

        <p className="text-ink-faint text-xs">
          Drafting writes messages for you to read. Nothing is approved or sent.
        </p>
      </div>

      <ul className="rule-t mt-6">
        {rows.map((row) => (
          <li key={row.id} className="rule-b flex items-baseline gap-3 py-2.5">
            <input
              type="checkbox"
              id={`prepare-${row.id}`}
              checked={selected.has(row.id)}
              onChange={() => toggle(row.id)}
              className="accent-accent translate-y-0.5"
            />
            <label htmlFor={`prepare-${row.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="text-sm font-medium">{row.organization}</span>
              {row.region ? (
                <span className="text-ink-faint ml-2 font-mono text-2xs">{row.region}</span>
              ) : null}
              {row.blockedReason ? (
                <span className="text-caution ml-2 font-mono text-2xs">
                  ▲ {row.blockedReason.replace(/_/g, ' ')}
                </span>
              ) : null}
            </label>
            <span data-numeric className="font-mono text-sm tabular-nums">
              {row.totalScore}
            </span>
          </li>
        ))}
      </ul>

      {result ? (
        <div className="border-line-strong bg-card mt-6 rounded-md border p-4">
          {!result.ok ? (
            <p className="text-sm">{result.detail}</p>
          ) : (
            <>
              <p className="text-sm">
                {result.preparedCount} message{result.preparedCount === 1 ? '' : 's'} drafted.
                {result.campaignId ? ' Open the campaign below to read them.' : ''}
              </p>

              {result.skipped.length > 0 ? (
                <>
                  <p className="text-2xs text-ink-faint mt-4 font-mono tracking-wide uppercase">
                    Not drafted — {result.skipped.length}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {result.skipped.map((row) => (
                      <li key={row.opportunityId} className="text-sm text-pretty">
                        <span className="font-medium">{row.organization}</span>
                        <span className="text-ink-muted"> — {row.explanation}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
