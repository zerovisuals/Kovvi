'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteSavedSearch,
  setSearchCadence,
  setSearchPaused,
  type ActionResult,
} from '@/server/settings/actions';

export type SavedSearchRow = {
  readonly id: string;
  readonly name: string;
  readonly moduleIds: readonly string[];
  readonly cadence: 'manual' | 'daily' | 'weekly' | 'monthly';
  readonly paused: boolean;
  readonly lastRunLabel: string;
};

/**
 * Saved searches.
 *
 * A cadence other than manual means the product will spend the user's allowance
 * without them present, so each row states the cadence in plain words rather
 * than as an icon, and a paused row says it is paused rather than merely
 * looking dimmer.
 */
export function SavedSearchList({ rows }: { readonly rows: readonly SavedSearchRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ActionResult | null>(null);

  function run(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      setNotice(await work());
      router.refresh();
    });
  }

  return (
    <div>
      <ul className="rule-t">
        {rows.map((row) => (
          <li key={row.id} className="rule-b py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <span className="text-sm font-medium">{row.name}</span>
                <span className="text-ink-faint ml-3 font-mono text-2xs">
                  {row.moduleIds.length > 0 ? row.moduleIds.join(', ') : 'no modules'}
                </span>
                <span className="text-ink-faint ml-3 font-mono text-2xs">
                  last run {row.lastRunLabel}
                </span>
                {row.paused ? (
                  <span className="text-caution ml-3 font-mono text-2xs">▲ paused</span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`cadence-${row.id}`}>
                  How often {row.name} looks again
                </label>
                <select
                  id={`cadence-${row.id}`}
                  value={row.cadence}
                  disabled={pending}
                  onChange={(fired) =>
                    run(() =>
                      setSearchCadence(row.id, fired.target.value as SavedSearchRow['cadence']),
                    )
                  }
                  className="border-line-strong bg-page h-8 rounded-sm border px-2 font-mono text-2xs"
                >
                  <option value="manual">Only when I ask</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setSearchPaused(row.id, !row.paused))}
                  className="border-line-strong ease-out inline-flex h-8 items-center rounded-sm border px-2.5 font-mono text-2xs transition-colors duration-instant hover:bg-sunken disabled:opacity-40"
                >
                  {row.paused ? 'Resume' : 'Pause'}
                </button>

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteSavedSearch(row.id))}
                  className="text-ink-faint ease-out font-mono text-2xs underline underline-offset-4 transition-opacity duration-instant hover:opacity-70 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {notice ? (
        <p className={`mt-3 text-sm ${notice.ok ? 'text-ink-muted' : 'text-caution'}`}>
          {notice.detail}
        </p>
      ) : null}
    </div>
  );
}
