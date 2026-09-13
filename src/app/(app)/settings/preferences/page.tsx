import type { Metadata } from 'next';
import { connection } from 'next/server';
import { eq } from 'drizzle-orm';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { PreferencesForm } from '@/components/settings/PreferencesForm';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { workspacePreference } from '@/server/db/schema';

export const metadata: Metadata = { title: 'Preferences' };

export default async function PreferencesPage() {
  const ctx = await requireTenant('/settings/preferences');
  await connection();

  const [row] = await getDb()
    .select()
    .from(workspacePreference)
    .where(eq(workspacePreference.workspaceId, ctx.workspaceId))
    .limit(1);

  return (
    <>
      <PageHeader
        title="Preferences"
        lede="How the product behaves for you, including whether it should be looking for work at all right now."
      />

      <PageBody>
        <PreferencesForm
          values={{
            timezone: row?.timezone ?? 'UTC',
            locale: row?.locale ?? 'en',
            capacity: row?.capacity ?? 'open',
            reducedMotion: row?.reducedMotion ?? false,
            defaultRunCap: row?.defaultRunCap ?? 25,
          }}
        />
      </PageBody>
    </>
  );
}
