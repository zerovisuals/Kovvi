'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { moveStage, recordOutcome, type ActionResult, type Stage } from '@/server/outreach/actions';
import type { PipelineCard } from '@/server/db/repo/outreach';

const STAGES: readonly { readonly key: Stage; readonly label: string }[] = [
  { key: 'discovered', label: 'Discovered' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'prepared', label: 'Prepared' },
  { key: 'approved', label: 'Approved' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'replied', label: 'Replied' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'suppressed', label: 'Suppressed' },
];

/**
 * The pipeline.
 *
 * A list, grouped by stage, is the default — not a board. Drag-and-drop columns
 * are the expected shape for this screen and they are the worse one here: they
 * are hostile to keyboards and screen readers, they hide stages off the right
 * edge, and moving a card is a gesture rather than a decision. A select is a
 * decision, and it works everywhere.
 *
 * Recording an outcome asks for a reason on a loss. The value of a pipeline to
 * a freelancer is not the count of won deals but knowing which kinds of
 * prospect were worth the afternoon, and "lost" with no reason answers nothing.
 */
export function PipelineView({ cards }: { readonly cards: readonly PipelineCard[] }) {
  const [recording, setRecording] = useState<string | null>(null);

  const byStage = new Map<string, PipelineCard[]>();
  for (const card of cards) {
    byStage.set(card.stage, [...(byStage.get(card.stage) ?? []), card]);
  }

  const populated = STAGES.filter((stage) => (byStage.get(stage.key)?.length ?? 0) > 0);

  return (
    <div>
      <ol className="text-2xs text-ink-faint flex flex-wrap gap-x-4 gap-y-1 font-mono tracking-wide uppercase">
        {STAGES.map((stage) => (
          <li key={stage.key}>
            {stage.label}{' '}
            <span data-numeric className="tabular-nums">
              {byStage.get(stage.key)?.length ?? 0}
            </span>
          </li>
        ))}
      </ol>

      {populated.map((stage) => (
        <section key={stage.key} className="rule-t mt-10 pt-6">
          <h2 className="font-display text-lg font-medium tracking-tight">
            {stage.label}{' '}
            <span data-numeric className="text-ink-faint font-mono text-sm tabular-nums">
              {byStage.get(stage.key)!.length}
            </span>
          </h2>

          <ul className="rule-t mt-3">
            {byStage.get(stage.key)!.map((card) => (
              <PipelineRow
                key={card.opportunityId}
                card={card}
                recording={recording === card.opportunityId}
                onRecord={() =>
                  setRecording(recording === card.opportunityId ? null : card.opportunityId)
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PipelineRow({
  card,
  recording,
  onRecord,
}: {
  readonly card: PipelineCard;
  readonly recording: boolean;
  readonly onRecord: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [kind, setKind] = useState<'won' | 'lost' | 'quoted' | 'qualified' | 'stalled'>('won');
  const [lossReason, setLossReason] = useState('');
  const [value, setValue] = useState('');

  function run(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      setNotice(await work());
      router.refresh();
    });
  }

  return (
    <li className="rule-b py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <Link
            href={`/opportunities/${card.opportunityId}`}
            className="ease-out text-sm font-medium transition-opacity duration-instant hover:opacity-70"
          >
            {card.organization}
          </Link>
          <span className="text-2xs text-ink-faint ml-3 font-mono">
            {card.region ?? 'region unknown'}
          </span>
          {card.blockedReason ? (
            <span className="text-caution ml-3 font-mono text-2xs">
              ▲ {card.blockedReason.replace(/_/g, ' ')}
            </span>
          ) : null}
          {card.outcomeKind ? (
            <span className="text-ink-faint ml-3 font-mono text-2xs">
              outcome: {card.outcomeKind}
              {card.dealValueCents !== null
                ? ` · €${(card.dealValueCents / 100).toLocaleString('en-IE')}`
                : ''}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span data-numeric className="text-ink-faint font-mono text-sm tabular-nums">
            {card.totalScore}
          </span>

          <label className="sr-only" htmlFor={`stage-${card.opportunityId}`}>
            Stage for {card.organization}
          </label>
          <select
            id={`stage-${card.opportunityId}`}
            value={card.stage}
            disabled={pending}
            onChange={(fired) => run(() => moveStage(card.opportunityId, fired.target.value as Stage))}
            className="border-line-strong bg-page h-8 rounded-sm border px-2 font-mono text-2xs"
          >
            {STAGES.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onRecord}
            className="border-line-strong ease-out inline-flex h-8 items-center rounded-sm border px-2.5 font-mono text-2xs transition-colors duration-instant hover:bg-sunken"
            aria-expanded={recording}
          >
            Record outcome
          </button>
        </div>
      </div>

      {recording ? (
        <div className="border-line bg-card mt-3 rounded-sm border p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
                What happened
              </span>
              <select
                value={kind}
                onChange={(fired) => setKind(fired.target.value as typeof kind)}
                className="border-line-strong bg-page mt-1 block h-8 rounded-sm border px-2 text-sm"
              >
                <option value="won">Won</option>
                <option value="quoted">Quoted</option>
                <option value="qualified">Qualified</option>
                <option value="stalled">Stalled</option>
                <option value="lost">Lost</option>
              </select>
            </label>

            {kind === 'won' || kind === 'quoted' ? (
              <label className="block">
                <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
                  Value (€)
                </span>
                <input
                  value={value}
                  onChange={(fired) => setValue(fired.target.value.replace(/[^\d]/g, ''))}
                  inputMode="numeric"
                  className="border-line-strong bg-page mt-1 block h-8 w-28 rounded-sm border px-2 text-sm tabular-nums"
                />
              </label>
            ) : null}

            {kind === 'lost' ? (
              <label className="block flex-1">
                <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
                  Why — required
                </span>
                <input
                  value={lossReason}
                  onChange={(fired) => setLossReason(fired.target.value)}
                  placeholder="Went with an agency; no budget; never replied"
                  className="border-line-strong bg-page mt-1 block h-8 w-full rounded-sm border px-2 text-sm"
                />
              </label>
            ) : null}

            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  recordOutcome({
                    opportunityId: card.opportunityId,
                    kind,
                    lossReason: lossReason || undefined,
                    dealValueCents: value ? Number(value) * 100 : undefined,
                  }),
                )
              }
              className="bg-accent text-accent-ink ease-out inline-flex h-8 items-center rounded-sm px-3 text-sm transition-opacity duration-instant hover:opacity-90 disabled:opacity-40"
            >
              Record
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p className={`mt-2 text-sm ${notice.ok ? 'text-ink-muted' : 'text-caution'}`}>
          {notice.detail}
        </p>
      ) : null}
    </li>
  );
}
