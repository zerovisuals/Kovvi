import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Research runs' };

export default async function Page() {
  await requireTenant('/runs');

  return (
    <>
      <PageHeader title="Research runs" lede="Every run, its real stage progress, and its per-source coverage including what failed." />
      <PageBody>
        <NotBuiltYet what="Research runs" plannedFor="phase 4" />
      </PageBody>
    </>
  );
}
