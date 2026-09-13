import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Preferences' };

export default async function Page() {
  await requireTenant('/settings/preferences');

  return (
    <>
      <PageHeader title="Preferences" lede="Theme, timezone, language and whether you are currently taking work." />
      <PageBody>
        <NotBuiltYet what="Preferences" plannedFor="phase 9" />
      </PageBody>
    </>
  );
}
