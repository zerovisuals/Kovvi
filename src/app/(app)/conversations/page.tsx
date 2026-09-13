import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Conversations' };

export default async function Page() {
  await requireTenant('/conversations');

  return (
    <>
      <PageHeader title="Conversations" lede="Replies and manually logged activity, with the organization's context beside the thread." />
      <PageBody>
        <NotBuiltYet what="Conversations" plannedFor="phase 7" />
      </PageBody>
    </>
  );
}
