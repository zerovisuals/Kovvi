import type { Metadata } from 'next';
import { connection } from 'next/server';
import { eq } from 'drizzle-orm';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { ProfileForm } from '@/components/settings/ProfileForm';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { portfolioProject, serviceProfile } from '@/server/db/schema';

export const metadata: Metadata = { title: 'Service profile' };

export default async function ProfilePage() {
  const ctx = await requireTenant('/settings/profile');
  await connection();

  const db = getDb();
  const [[profile], projects] = await Promise.all([
    db
      .select()
      .from(serviceProfile)
      .where(eq(serviceProfile.workspaceId, ctx.workspaceId))
      .limit(1),
    db
      .select()
      .from(portfolioProject)
      .where(eq(portfolioProject.workspaceId, ctx.workspaceId)),
  ]);

  return (
    <>
      <PageHeader
        title="Service profile"
        lede="What you do, where, and for whom. Ranking matches prospects against this, and drafts cite it by name."
        meta={
          <>
            <span>{profile?.confirmedAt ? 'confirmed' : 'draft — not yet confirmed'}</span>
            <span aria-hidden>·</span>
            <span>
              {projects.length} portfolio project{projects.length === 1 ? '' : 's'}
            </span>
          </>
        }
      />

      <PageBody>
        <ProfileForm
          values={{
            headline: profile?.headline ?? '',
            services: (profile?.services ?? []).join(', '),
            regions: (profile?.regions ?? []).join(', '),
            languages: (profile?.languages ?? []).join(', '),
            exclusions: (profile?.exclusions ?? []).join(', '),
            minProjectPrice: profile?.minProjectPriceCents
              ? String(profile.minProjectPriceCents / 100)
              : '',
            confirmed: profile?.confirmedAt !== null && profile?.confirmedAt !== undefined,
          }}
          projects={projects.map((row) => ({
            id: row.id,
            url: row.url,
            title: row.title,
            role: row.role,
            isRepresentative: row.isRepresentative,
          }))}
        />
      </PageBody>
    </>
  );
}
