import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { ReviewBatch } from '@/components/outreach/ReviewBatch';
import { ProductState } from '@/components/state/ProductState';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { loadCampaignReview } from '@/server/db/repo/outreach';
import { capabilityState } from '@/server/capabilities/registry';

export const metadata: Metadata = { title: 'Campaign review' };

export default async function CampaignReviewPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const ctx = await requireTenant(`/outreach/${campaignId}`);
  await connection();

  const review = await loadCampaignReview(getDb(), ctx, campaignId);
  if (!review) notFound();

  const sendingLive = capabilityState('email_sending').state === 'live';
  const approved = review.rows.filter((row) => row.approvedForThisVersion).length;

  return (
    <>
      <PageHeader
        title={review.campaign.name}
        lede="This is the batch as it would go out. Read each message, then approve it on its own text."
        actions={
          <Link
            href="/outreach"
            className="border-line-strong ease-out inline-flex h-9 items-center rounded-sm border px-3 text-sm transition-colors duration-instant hover:bg-sunken"
          >
            All campaigns
          </Link>
        }
        meta={
          <>
            <span>
              {review.rows.length} message{review.rows.length === 1 ? '' : 's'}
            </span>
            <span aria-hidden>·</span>
            <span>{approved} approved</span>
            <span aria-hidden>·</span>
            <span>{review.campaign.status.replace(/_/g, ' ')}</span>
            <span aria-hidden>·</span>
            <span>{review.campaign.channel}</span>
          </>
        }
      />

      <PageBody>
        {review.campaign.pauseReason ? (
          <div className="mb-10">
            <ProductState
              state="campaign_paused"
              variant="blocking"
              whatWeKnow={`Paused because of ${review.campaign.pauseReason.replace(/_/g, ' ')}. Every draft and approval below is preserved.`}
            />
          </div>
        ) : null}

        {review.rows.length === 0 ? (
          <ProductState
            state="no_matches"
            title="This campaign has no messages"
            explanation="Every organization selected was skipped at drafting, each for a stated reason. The campaign exists because at least one draft was written and has since been removed."
          />
        ) : (
          <ReviewBatch rows={review.rows} sendingLive={sendingLive} />
        )}
      </PageBody>
    </>
  );
}
