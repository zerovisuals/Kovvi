import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { listOpportunities } from '@/server/db/repo/opportunity';
import { listCampaigns, listConversations, listPipeline } from '@/server/db/repo/outreach';
import { latestRunCoverage } from '@/server/db/repo/runs';
import { balanceFor, PLAN_ALLOWANCES } from '@/server/billing/usage';

export const metadata: Metadata = { title: 'Today' };

/**
 * Today.
 *
 * A queue of decisions, not a dashboard. Every item here is something only the
 * user can resolve — an identity we cannot settle, a reply we will not
 * interpret, a message waiting on their approval. Counts that merely describe
 * the workspace ("47 opportunities") are deliberately absent: they look like
 * progress and ask nothing.
 *
 * When there is nothing to decide, the screen says so and stops. A product that
 * manufactures work to fill this page is training its user to ignore it.
 */
export default async function TodayPage() {
  const ctx = await requireTenant('/today');
  await connection();

  const db = getDb();
  const [opportunities, campaigns, threads, pipeline, coverage, balance] = await Promise.all([
    listOpportunities(db, ctx),
    listCampaigns(db, ctx),
    listConversations(db, ctx),
    listPipeline(db, ctx),
    latestRunCoverage(db, ctx),
    balanceFor(db, ctx.workspaceId, 'deep_assessment'),
  ]);

  const conflicts = opportunities.filter((row) => row.identityConflictOpen);
  const unclassified = threads.filter((row) => row.awaitingClassification > 0);
  const awaitingApproval = campaigns.filter(
    (row) => row.messageCount > row.approvedCount && row.status !== 'cancelled',
  );
  const blocked = opportunities.filter(
    (row) => row.blockedReason !== null && !row.identityConflictOpen,
  );
  const stalled = pipeline.filter((row) => row.stage === 'contacted');
  const unavailable = coverage.filter((source) => source.absent);

  const decisions =
    conflicts.length +
    unclassified.length +
    awaitingApproval.length +
    blocked.length +
    stalled.length;

  return (
    <>
      <PageHeader
        title="Today"
        lede="What is waiting on a decision only you can make."
        meta={
          <>
            <span>
              {decisions} item{decisions === 1 ? '' : 's'}
            </span>
            <span aria-hidden>·</span>
            <span>
              {balance} of {PLAN_ALLOWANCES.pro.deep_assessment} assessments left
            </span>
          </>
        }
      />

      <PageBody>
        {decisions === 0 ? (
          <div className="max-w-(--spacing-measure)">
            <p className="font-display text-lg font-medium tracking-tight">
              Nothing is waiting on you.
            </p>
            <p className="text-ink-muted mt-2 text-pretty">
              No unresolved identities, no unread replies, no messages pending approval. This page
              stays empty rather than inventing something to do — the afternoon is yours.
            </p>
            <Link
              href="/discover"
              className="border-line-strong ease-out mt-5 inline-flex h-9 items-center rounded-sm border px-3 text-sm transition-colors duration-instant hover:bg-sunken"
            >
              Start a research run
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {conflicts.length > 0 ? (
              <Queue
                title="Identities we cannot settle"
                why="Outreach is blocked until these are resolved. Writing to the wrong company about a competitor's website is a mistake you would wear publicly."
              >
                {conflicts.map((row) => (
                  <Item
                    key={row.id}
                    href={`/opportunities/${row.id}`}
                    label={row.businessName}
                    detail={row.region ?? 'region unknown'}
                  />
                ))}
              </Queue>
            ) : null}

            {unclassified.length > 0 ? (
              <Queue
                title="Replies waiting on your reading"
                why="The system does not guess what a reply meant. A polite brush-off reads a great deal like interest to a classifier."
              >
                {unclassified.map((row) => (
                  <Item
                    key={row.id}
                    href={`/conversations/${row.id}`}
                    label={row.organization}
                    detail={`${row.awaitingClassification} unclassified`}
                  />
                ))}
              </Queue>
            ) : null}

            {awaitingApproval.length > 0 ? (
              <Queue
                title="Messages waiting on your approval"
                why="Nothing goes out until you have read the actual text. There is no way to approve a batch without reading it."
              >
                {awaitingApproval.map((row) => (
                  <Item
                    key={row.id}
                    href={`/outreach/${row.id}`}
                    label={row.name}
                    detail={`${row.messageCount - row.approvedCount} of ${row.messageCount} unapproved`}
                  />
                ))}
              </Queue>
            ) : null}

            {blocked.length > 0 ? (
              <Queue
                title="Blocked for a reason you can act on"
                why="Each of these has a specific obstacle — no contact route, evidence past its freshness window, a suppression. None of them is a ranking problem."
              >
                {blocked.map((row) => (
                  <Item
                    key={row.id}
                    href={`/opportunities/${row.id}`}
                    label={row.businessName}
                    detail={(row.blockedReason ?? '').replace(/_/g, ' ')}
                  />
                ))}
              </Queue>
            ) : null}

            {stalled.length > 0 ? (
              <Queue
                title="Contacted, nothing back yet"
                why="Shown so they do not quietly disappear. Whether to follow up is a judgement about the relationship, not a rule the product should apply."
              >
                {stalled.map((row) => (
                  <Item
                    key={row.opportunityId}
                    href={`/opportunities/${row.opportunityId}`}
                    label={row.organization}
                    detail={row.lastActivityAt.toISOString().slice(0, 10)}
                  />
                ))}
              </Queue>
            ) : null}
          </div>
        )}

        {unavailable.length > 0 ? (
          <p className="rule-t text-ink-muted mt-12 max-w-(--spacing-measure) pt-6 text-sm text-pretty">
            Your most recent run could not reach{' '}
            {unavailable.map((source) => source.label).join(', ')}. Anything those sources would
            have found is missing from everything above.
          </p>
        ) : null}
      </PageBody>
    </>
  );
}

function Queue({
  title,
  why,
  children,
}: {
  readonly title: string;
  readonly why: string;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-medium tracking-tight">{title}</h2>
      <p className="text-ink-muted mt-1.5 max-w-(--spacing-measure) text-sm text-pretty">{why}</p>
      <ul className="rule-t mt-4">{children}</ul>
    </section>
  );
}

function Item({
  href,
  label,
  detail,
}: {
  readonly href: string;
  readonly label: string;
  readonly detail: string;
}) {
  return (
    <li className="rule-b py-2.5">
      <Link
        href={href}
        className="ease-out flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 transition-opacity duration-instant hover:opacity-70"
      >
        <span className="text-sm font-medium">{label}</span>
        <span className="text-ink-faint font-mono text-2xs">{detail}</span>
      </Link>
    </li>
  );
}
