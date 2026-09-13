import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Billing and usage' };

export default async function Page() {
  await requireTenant('/settings/billing');

  return (
    <>
      <PageHeader title="Billing and usage" lede="Your allowance, what each run consumed, refunds for failed work, and export." />
      <PageBody>
        <NotBuiltYet what="Billing and usage" plannedFor="phase 8" />
      </PageBody>
    </>
  );
}
