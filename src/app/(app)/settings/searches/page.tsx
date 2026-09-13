import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Saved searches' };

export default async function Page() {
  await requireTenant('/settings/searches');

  return (
    <>
      <PageHeader title="Saved searches" lede="Monitoring cadence, and what counts as genuinely new rather than new-to-you." />
      <PageBody>
        <NotBuiltYet what="Saved searches" plannedFor="phase 9" />
      </PageBody>
    </>
  );
}
