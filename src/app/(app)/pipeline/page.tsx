import type { Metadata } from 'next';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { PipelineView } from '@/components/outreach/PipelineView';
import { ProductState } from '@/components/state/ProductState';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { listPipeline } from '@/server/db/repo/outreach';

export const metadata: Metadata = { title: 'Pipeline' };

/**
 * The pipeline.
 *
 * The won/lost figures are counts of what the user recorded, and nothing else.
 * There is deliberately no conversion rate, no forecast and no projected value:
 * the sample size a single freelancer works at cannot support any of them, and
 * a percentage computed from eleven opportunities would carry an authority it
 * has not earned.
 */
export default async function PipelinePage() {
  const ctx = await requireTenant('/pipeline');
  await connection();

  const cards = await listPipeline(getDb(), ctx);

  const won = cards.filter((card) => card.stage === 'won');
  const lost = cards.filter((card) => card.stage === 'lost');
  const wonValue = won.reduce((total, card) => total + (card.dealValueCents ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        lede="Where each conversation actually stands. Stages are yours to set — nothing advances itself."
        meta={
          <>
            <span>{cards.length} open and closed</span>
            <span aria-hidden>·</span>
            <span>
              {won.length} won, {lost.length} lost
            </span>
            {wonValue > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>€{(wonValue / 100).toLocaleString('en-IE')} recorded</span>
              </>
            ) : null}
          </>
        }
      />

      <PageBody>
        {cards.length === 0 ? (
          <ProductState
            state="no_matches"
            title="Nothing in the pipeline yet"
            explanation="Opportunities land here as soon as a research run finds them, and move through stages as you decide they should."
            actions={[{ label: 'Start a research run', href: '/discover', primary: true }]}
          />
        ) : (
          <PipelineView cards={cards} />
        )}
      </PageBody>
    </>
  );
}
