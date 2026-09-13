import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Data' };

export default async function Page() {
  await requireTenant('/settings/data');

  return (
    <>
      <PageHeader title="Data" lede="Export everything, read the audit log, or delete the workspace." />
      <PageBody>
        <NotBuiltYet what="Data" plannedFor="phase 8" />
      </PageBody>
    </>
  );
}
