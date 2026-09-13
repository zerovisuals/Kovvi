import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Profile' };

export default async function Page() {
  await requireTenant('/settings/profile');

  return (
    <>
      <PageHeader title="Profile" lede="Your services, price floor, regions, languages and exclusions — plus the portfolio work every match is measured against." />
      <PageBody>
        <NotBuiltYet what="Profile" plannedFor="phase 9" />
      </PageBody>
    </>
  );
}
