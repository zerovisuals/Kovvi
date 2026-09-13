import type { Metadata } from 'next';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { ProductState } from '@/components/state/ProductState';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { listRuns } from '@/server/db/repo/runs';
import { describeAge } from '@/server/evidence/dates';

export const metadata: Metadata = { title: 'Research runs' };

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  completed_partial: 'Completed with gaps',
  capped: 'Stopped at your limit',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

/**
 * Research runs.
 *
 * Every run shows its coverage, because coverage is what makes a result
 * interpretable: "14 organizations" means one thing when every source answered
 * and something quite different when two were unavailable. The units line is
 * shown for the same reason — reserved, spent and refunded separately, so a
 * refund after a failure is visible rather than implied.
 */
export default async function RunsPage() {
  const ctx = await requireTenant('/runs');
  await connection();

  const runs = await listRuns(getDb(), ctx, 30);

  return (
    <>
      <PageHeader
        title="Research runs"
        lede="What was searched, what answered, and what it cost. A run that stopped at your limit keeps everything it had already found."
        meta={
          <span>
            {runs.length} run{runs.length === 1 ? '' : 's'}
          </span>
        }
      />

      <PageBody>
        {runs.length === 0 ? (
          <ProductState
            state="no_matches"
            title="No research runs yet"
            explanation="A run is how organizations get into the product. Set the modules, the filters and a ceiling, and it stops there."
            whatWeKnow="Nothing has been spent from your allowance."
            actions={[{ label: 'Start a research run', href: '/discover', primary: true }]}
          />
        ) : (
          <ul className="rule-t">
            {runs.map((run) => {
              const unavailable = run.coverage.filter((source) => source.absent);
              const spent = run.unitsFinalised - run.unitsRefunded;

              return (
                <li key={run.id} className="rule-b py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <span className="font-display text-base font-medium tracking-tight">
                      {run.moduleIds.length > 0 ? run.moduleIds.join(', ') : 'Imported URLs'}
                    </span>
                    <span className="text-2xs text-ink-faint flex flex-wrap items-center gap-x-3 font-mono">
                      <span>{STATUS_LABEL[run.status] ?? run.status}</span>
                      <span aria-hidden>·</span>
                      <span>{describeAge(run.createdAt, 'day')}</span>
                    </span>
                  </div>

                  <p className="text-ink-muted mt-1.5 font-mono text-2xs">
                    {spent} of {run.unitCap} units spent
                    {run.unitsRefunded > 0 ? ` · ${run.unitsRefunded} refunded` : ''}
                    {run.coverage.length > 0
                      ? ` · ${run.coverage.length - unavailable.length} of ${run.coverage.length} sources answered`
                      : ''}
                  </p>

                  {run.status === 'capped' ? (
                    <p className="text-ink-muted mt-2 max-w-(--spacing-measure) text-sm text-pretty">
                      This run reached the ceiling you set and stopped. Everything it had already
                      found is on the shortlist — nothing was discarded.
                    </p>
                  ) : null}

                  {unavailable.length > 0 ? (
                    <p className="text-caution mt-2 max-w-(--spacing-measure) text-sm text-pretty">
                      ▲ Not connected: {unavailable.map((source) => source.label).join(', ')}. A
                      source that did not run is not evidence that nothing was there.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
