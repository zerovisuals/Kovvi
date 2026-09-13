import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { ConversationThreadView } from '@/components/outreach/ConversationThreadView';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { loadConversation } from '@/server/db/repo/outreach';

export const metadata: Metadata = { title: 'Conversation' };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const ctx = await requireTenant(`/conversations/${conversationId}`);
  await connection();

  const thread = await loadConversation(getDb(), ctx, conversationId);
  if (!thread) notFound();

  return (
    <>
      <PageHeader
        title={thread.organization}
        lede="The thread as it happened. Nothing here was written or interpreted by the system on your behalf."
        actions={
          <Link
            href={`/opportunities/${thread.opportunityId}`}
            className="border-line-strong ease-out inline-flex h-9 items-center rounded-sm border px-3 text-sm transition-colors duration-instant hover:bg-sunken"
          >
            Open the dossier
          </Link>
        }
        meta={
          <>
            <span>{thread.channel}</span>
            <span aria-hidden>·</span>
            <span>
              {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
            </span>
          </>
        }
      />

      <PageBody>
        <ConversationThreadView thread={thread} />
      </PageBody>
    </>
  );
}
