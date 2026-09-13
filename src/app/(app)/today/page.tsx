import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Today' };

export default async function Page() {
  await requireTenant('/today');

  return (
    <>
      <PageHeader title="Today" lede="What needs you now — opportunities awaiting review, replies awaiting an answer, and research still running. Deliberately not a dashboard: no vanity counters." />
      <PageBody>
        <NotBuiltYet what="Today" plannedFor="phase 9" />
      </PageBody>
    </>
  );
}
