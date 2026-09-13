'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfidenceMark, ScoreMark } from './ConfidenceMark';
import { SampleBadge } from '@/components/sample/SampleBadge';
import type { ShortlistRow } from '@/server/db/repo/opportunity';

/**
 * THE TRIAGE TABLE
 *
 * Judging fifty prospects is the actual work this product exists to make
 * bearable, so it is built for the keyboard: j/k to move, s to shortlist, x to
 * dismiss, Enter to open. The affordances are visible rather than hidden behind
 * a help dialog, because a shortcut nobody discovers is a shortcut nobody uses.
 *
 * Two deliberate refusals in the design:
 *
 *  - Rows are a table, not cards. Fifty cards is a scroll; fifty rows is a
 *    comparison, and comparison is what the user is here to do.
 *  - Scores are never compared across industries. A fashion score and a
 *    consultancy score come from different evidence with different base rates,
 *    and the header says so rather than leaving the user to assume otherwise.
 */

const MODULE_LABELS: Record<string, string> = {
  fashion: 'Fashion',
  creators: 'Creators',
  hospitality: 'Hospitality',
  local_services: 'Local services',
  professional: 'Professional',
  software: 'Software',
  esports: 'Esports',
  custom: 'Custom',
};

export function ShortlistTable({ rows }: { rows: readonly ShortlistRow[] }) {
  const router = useRouter();
  const [cursor, setCursor] = useState(0);
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const visible = rows.filter((row) => !dismissed.has(row.id));
  const current = visible[Math.min(cursor, visible.length - 1)];

  const move = useCallback(
    (delta: number) => {
      setCursor((value) => Math.max(0, Math.min(visible.length - 1, value + delta)));
    },
    [visible.length],
  );

  useEffect(() => {
    function onKey(keyEvent: KeyboardEvent) {
      // Never steal keys from a field the user is typing in.
      const target = keyEvent.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;

      switch (keyEvent.key) {
        case 'j':
        case 'ArrowDown':
          keyEvent.preventDefault();
          move(1);
          break;
        case 'k':
        case 'ArrowUp':
          keyEvent.preventDefault();
          move(-1);
          break;
        case 's':
          if (current) {
            keyEvent.preventDefault();
            setSaved((value) => new Set(value).add(current.id));
            move(1);
          }
          break;
        case 'x':
          if (current) {
            keyEvent.preventDefault();
            setDismissed((value) => new Set(value).add(current.id));
          }
          break;
        case 'Enter':
          if (current) {
            keyEvent.preventDefault();
            router.push(`/opportunities/${current.id}`);
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, move, router]);

  // Keep the cursor row in view when navigating by keyboard.
  useEffect(() => {
    const row = containerRef.current?.querySelector<HTMLElement>('[data-cursor="true"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <div ref={containerRef}>
      <KeyboardLegend />

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="rule-b text-2xs text-ink-faint font-mono tracking-wide uppercase">
            <th scope="col" className="py-2 pr-4 font-normal">
              Organization
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Industry
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Evidence
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Contact
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              Score
            </th>
          </tr>
        </thead>

        <tbody>
          {visible.map((row, index) => {
            const isCursor = index === cursor;

            return (
              <tr
                key={row.id}
                data-cursor={isCursor}
                onClick={() => setCursor(index)}
                onDoubleClick={() => router.push(`/opportunities/${row.id}`)}
                className={`rule-b ease-out h-(--spacing-row) cursor-default transition-colors duration-instant ${
                  isCursor ? 'bg-accent-weak' : 'hover:bg-sunken'
                }`}
              >
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    {/* The cursor is marked by a rule as well as a fill, so it
                        survives a palette with a subtle accent. */}
                    <span
                      aria-hidden
                      className={`h-4 w-0.5 rounded-full ${isCursor ? 'bg-accent' : 'bg-transparent'}`}
                    />
                    <a
                      href={`/opportunities/${row.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {row.businessName}
                    </a>
                    {saved.has(row.id) ? (
                      <span className="text-2xs text-positive font-mono">saved</span>
                    ) : null}
                    {row.dataOrigin === 'sample' ? <SampleBadge /> : null}
                  </div>
                  {row.region ? (
                    <div className="text-2xs text-ink-faint mt-0.5 pl-3.5 font-mono">
                      {row.region}
                    </div>
                  ) : null}
                </td>

                <td className="py-2 pr-4">
                  <span className="text-ink-muted text-sm">
                    {row.moduleIds.map((id) => MODULE_LABELS[id] ?? id).join(' + ')}
                  </span>
                  {row.moduleIds.length > 1 ? (
                    <div
                      className="text-2xs text-ink-faint mt-0.5 font-mono"
                      title="Found by more than one industry module. One prospect, counted once."
                    >
                      found twice · counted once
                    </div>
                  ) : null}
                </td>

                <td className="py-2 pr-4">
                  <ConfidenceMark confidence={row.confidenceBand} />
                </td>

                <td className="py-2 pr-4">
                  {row.identityConflictOpen ? (
                    <span className="text-2xs text-critical font-mono">✕ identity conflict</span>
                  ) : row.hasContact ? (
                    <span className="text-2xs text-ink-muted font-mono">✓ contact found</span>
                  ) : (
                    <span className="text-2xs text-uncertain font-mono">○ none found</span>
                  )}
                </td>

                <td className="py-2 pr-4 text-right">
                  <ScoreMark score={row.totalScore} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {dismissed.size > 0 ? (
        <p className="text-ink-faint mt-4 font-mono text-2xs">
          {dismissed.size} dismissed this session.{' '}
          <button
            type="button"
            onClick={() => setDismissed(new Set())}
            className="text-ink underline underline-offset-2"
          >
            Undo
          </button>
        </p>
      ) : null}
    </div>
  );
}

function KeyboardLegend() {
  return (
    <div className="text-2xs text-ink-faint mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
      <Key combo="j / k" action="move" />
      <Key combo="s" action="shortlist" />
      <Key combo="x" action="dismiss" />
      <Key combo="enter" action="open" />
    </div>
  );
}

function Key({ combo, action }: { combo: string; action: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="border-line bg-sunken rounded-xs border px-1.5 py-0.5">{combo}</kbd>
      <span>{action}</span>
    </span>
  );
}
