import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Discover' };

export default async function Page() {
  await requireTenant('/discover');

  return (
    <>
      <PageHeader title="Discover" lede="Choose industries, regions and freshness, see which sources can actually answer, and set a spend ceiling before anything runs." />
      <PageBody>
        <NotBuiltYet what="Discover" plannedFor="phase 6" />
      </PageBody>
    </>
  );
}
