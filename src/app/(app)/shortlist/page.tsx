import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { ShortlistTable } from '@/components/opportunity/ShortlistTable';
import { ProductState } from '@/components/state/ProductState';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { listOpportunities } from '@/server/db/repo/opportunity';
import { latestRunCoverage } from '@/server/db/repo/runs';
import { HEURISTIC_NOTE } from '@/server/rank/score';

export const metadata: Metadata = { title: 'Shortlist' };

/**
 * The shortlist.
 *
 * Everything on this screen is scoped to what was actually found. The coverage
 * line is not a footnote: if a source could not run, the list is incomplete in
 * a way the user needs to know about before concluding anything from its
 * length. A shorter list and a partial list look identical otherwise.
 */
export default async function ShortlistPage() {
  const ctx = await requireTenant('/shortlist');
  const db = getDb();

  const [rows, coverage] = await Promise.all([
    listOpportunities(db, ctx),
    latestRunCoverage(db, ctx),
  ]);

  const unavailable = coverage.filter((source) => source.absent);
  const failed = coverage.filter((source) => source.failed > 0);

  return (
    <>
      <PageHeader
        title="Shortlist"
        lede="What came back, ranked. Every claim here carries the source it came from — open any chip to read the original."
        meta={
          <>
            <span>{rows.length} organizations</span>
            {coverage.length > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {coverage.length - unavailable.length} of {coverage.length} sources answered
                </span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span title={HEURISTIC_NOTE}>scores are a heuristic, not a probability</span>
          </>
        }
      />

      <PageBody>
        {unavailable.length > 0 || failed.length > 0 ? (
          <div className="mb-8">
            <ProductState
              state="partial_results"
              variant="blocking"
              whatWeKnow={[
                unavailable.length > 0
                  ? `Not connected: ${unavailable.map((source) => source.label).join(', ')}.`
                  : null,
                failed.length > 0
                  ? `Failed: ${failed.map((source) => source.label).join(', ')}.`
                  : null,
                'A source that did not run is not evidence that nothing was there.',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          </div>
        ) : null}

        {rows.length === 0 ? (
          <ProductState state="no_matches" />
        ) : (
          <ShortlistTable rows={rows} />
        )}
      </PageBody>
    </>
  );
}
