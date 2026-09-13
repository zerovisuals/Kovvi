import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Pipeline' };

export default async function Page() {
  await requireTenant('/pipeline');

  return (
    <>
      <PageHeader title="Pipeline" lede="From contacted to won or lost, with the loss reasons that make the next run better." />
      <PageBody>
        <NotBuiltYet what="Pipeline" plannedFor="phase 7" />
      </PageBody>
    </>
  );
}
