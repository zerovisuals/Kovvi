import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { ProductState } from '@/components/state/ProductState';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { listConversations } from '@/server/db/repo/outreach';

export const metadata: Metadata = { title: 'Conversations' };

export default async function ConversationsPage() {
  const ctx = await requireTenant('/conversations');
  await connection();

  const threads = await listConversations(getDb(), ctx);
  const awaiting = threads.reduce((total, row) => total + row.awaitingClassification, 0);

  return (
    <>
      <PageHeader
        title="Conversations"
        lede="What was sent, what came back, and what you made of it. Replies are never classified for you."
        meta={
          <>
            <span>
              {threads.length} thread{threads.length === 1 ? '' : 's'}
            </span>
            {awaiting > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>{awaiting} reply awaiting your reading</span>
              </>
            ) : null}
          </>
        }
      />

      <PageBody>
        {threads.length === 0 ? (
          <ProductState
            state="no_matches"
            title="No conversations yet"
            explanation="A thread appears here once a message is logged as sent, or once you record a reply against an opportunity."
            whatWeKnow="Nothing has been sent from this workspace."
            actions={[{ label: 'Go to outreach', href: '/outreach', primary: true }]}
          />
        ) : (
          <ul className="rule-t">
            {threads.map((row) => (
              <li key={row.id} className="rule-b py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <Link
                    href={`/conversations/${row.id}`}
                    className="font-display ease-out text-base font-medium tracking-tight transition-opacity duration-instant hover:opacity-70"
                  >
                    {row.organization}
                  </Link>
                  <span className="text-2xs text-ink-faint flex flex-wrap items-center gap-x-3 font-mono">
                    <span>{row.channel}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {row.messageCount} message{row.messageCount === 1 ? '' : 's'}
                    </span>
                    {row.awaitingClassification > 0 ? (
                      <span className="text-uncertain">
                        ○ {row.awaitingClassification} unclassified
                      </span>
                    ) : null}
                    {row.lastMessageAt ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{row.lastMessageAt.toISOString().slice(0, 10)}</span>
                      </>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}
