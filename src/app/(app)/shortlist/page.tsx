import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Shortlist' };

export default async function Page() {
  await requireTenant('/shortlist');

  return (
    <>
      <PageHeader title="Shortlist" lede="Judge what came back. Every row carries its reason-now, its evidence confidence and its verified website state, so a decision takes seconds rather than a tab excavation." />
      <PageBody>
        <NotBuiltYet what="Shortlist" plannedFor="phase 6" />
      </PageBody>
    </>
  );
}
