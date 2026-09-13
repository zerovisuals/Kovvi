import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { NotBuiltYet } from '@/components/state/NotBuiltYet';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Outreach' };

export default async function Page() {
  await requireTenant('/outreach');

  return (
    <>
      <PageHeader title="Outreach" lede="Review the actual batch — every recipient, every message body, the follow-up schedule and the projected usage — then approve it. There is no autopilot toggle." />
      <PageBody>
        <NotBuiltYet what="Outreach" plannedFor="phase 7" />
      </PageBody>
    </>
  );
}
