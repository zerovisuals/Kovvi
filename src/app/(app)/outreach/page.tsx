import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { PrepareForm } from '@/components/outreach/PrepareForm';
import { ProductState } from '@/components/state/ProductState';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { listCampaigns } from '@/server/db/repo/outreach';
import { listOpportunities } from '@/server/db/repo/opportunity';
import { capabilityState } from '@/server/capabilities/registry';

export const metadata: Metadata = { title: 'Outreach' };

/**
 * Outreach.
 *
 * Two halves: what is waiting to be drafted, and the campaigns already drafted.
 * The order is deliberate — preparing is the step the user is here to take, and
 * a list of past campaigns above it would bury it.
 */
export default async function OutreachPage() {
  const ctx = await requireTenant('/outreach');
  await connection();

  const db = getDb();
  const [campaigns, opportunities] = await Promise.all([
    listCampaigns(db, ctx),
    listOpportunities(db, ctx),
  ]);

  const sendingLive = capabilityState('email_sending').state === 'live';

  const preparable = opportunities
    .filter((row) => row.stage === 'discovered' || row.stage === 'shortlisted')
    .map((row) => ({
      id: row.id,
      organization: row.businessName,
      region: row.region,
      totalScore: row.totalScore,
      stage: row.stage,
      blockedReason: row.blockedReason,
    }));

  const paused = campaigns.filter((row) => row.status === 'paused');

  return (
    <>
      <PageHeader
        title="Outreach"
        lede="Review the actual batch — every recipient, every message body — then approve each one. There is no autopilot toggle."
        meta={
          <>
            <span>{preparable.length} waiting to be drafted</span>
            <span aria-hidden>·</span>
            <span>
              {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}
            </span>
            <span aria-hidden>·</span>
            <span>{sendingLive ? 'email provider connected' : 'sending not connected'}</span>
          </>
        }
      />

      <PageBody>
        {!sendingLive ? (
          <div className="mb-10">
            <ProductState
              state="account_disconnected"
              variant="blocking"
              title="No email provider is connected"
              explanation="Drafting, review and approval all work. Dispatch does not, because there is nothing to dispatch through — and a queued message that silently never left would be worse than this notice."
              whatWeKnow="Approved messages can be copied and sent yourself. Logging that you sent one keeps follow-ups, replies and the pipeline accurate."
            />
          </div>
        ) : null}

        {paused.length > 0 ? (
          <div className="mb-10">
            <ProductState
              state="campaign_paused"
              variant="blocking"
              whatWeKnow={`${paused.length} campaign${paused.length === 1 ? '' : 's'} paused: ${paused
                .map((row) => `${row.name} (${(row.pauseReason ?? 'unknown').replace(/_/g, ' ')})`)
                .join(', ')}. Drafts and approvals are untouched.`}
            />
          </div>
        ) : null}

        <section>
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
            Prepare a campaign
          </h2>
          <div className="mt-4">
            <PrepareForm rows={preparable} />
          </div>
        </section>

        <section className="rule-t mt-12 pt-8 pb-16">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Campaigns</h2>

          {campaigns.length === 0 ? (
            <p className="text-ink-muted mt-3 max-w-(--spacing-measure) text-sm text-pretty">
              None yet. A campaign is created the first time you draft messages — never before, so
              there is no empty shell to wonder about.
            </p>
          ) : (
            <ul className="rule-t mt-3">
              {campaigns.map((row) => (
                <li
                  key={row.id}
                  className="rule-b flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
                >
                  <Link
                    href={`/outreach/${row.id}`}
                    className="font-display ease-out text-base font-medium tracking-tight transition-opacity duration-instant hover:opacity-70"
                  >
                    {row.name}
                  </Link>
                  <span className="text-2xs text-ink-faint flex flex-wrap items-center gap-x-3 font-mono">
                    <span>{row.status.replace(/_/g, ' ')}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {row.approvedCount}/{row.messageCount} approved
                    </span>
                    {row.sentCount > 0 ? <span>{row.sentCount} sent</span> : null}
                    <span aria-hidden>·</span>
                    <span>{row.createdAt.toISOString().slice(0, 10)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageBody>
    </>
  );
}
