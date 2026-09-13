import type { Metadata } from 'next';
import { connection } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { SavedSearchList } from '@/components/settings/SavedSearchList';
import { ProductState } from '@/components/state/ProductState';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { savedSearch, workspacePreference } from '@/server/db/schema';
import { describeAge } from '@/server/evidence/dates';

export const metadata: Metadata = { title: 'Saved searches' };

/**
 * Saved searches and monitoring.
 *
 * The relative "last run" label is computed here, on the server, against one
 * clock reading — the same rule the evidence rail follows. A component that
 * reads the clock during render is impure and, worse, would disagree with the
 * dates shown everywhere else on the page.
 */
export default async function SearchesPage() {
  const ctx = await requireTenant('/settings/searches');
  await connection();

  const db = getDb();
  const [rows, [preference]] = await Promise.all([
    db
      .select()
      .from(savedSearch)
      .where(eq(savedSearch.workspaceId, ctx.workspaceId))
      .orderBy(desc(savedSearch.createdAt)),
    db
      .select({ capacity: workspacePreference.capacity })
      .from(workspacePreference)
      .where(eq(workspacePreference.workspaceId, ctx.workspaceId))
      .limit(1),
  ]);

  const booked = preference?.capacity === 'booked';
  const monitoring = rows.filter((row) => !row.paused && row.cadence !== 'manual');

  return (
    <>
      <PageHeader
        title="Saved searches"
        lede="Searches you can re-run, and the ones allowed to look again on their own."
        meta={
          <>
            <span>
              {rows.length} saved
            </span>
            <span aria-hidden>·</span>
            <span>{monitoring.length} monitoring</span>
            {booked ? (
              <>
                <span aria-hidden>·</span>
                <span>you are marked booked</span>
              </>
            ) : null}
          </>
        }
      />

      <PageBody>
        {booked ? (
          <p className="border-line-strong bg-sunken mb-8 max-w-(--spacing-measure) rounded-sm border p-3 text-sm text-pretty">
            You are marked as booked, so monitoring is paused. Generating opportunities you cannot
            take would spend your allowance for nothing.
          </p>
        ) : null}

        {rows.length === 0 ? (
          <ProductState
            state="no_matches"
            title="No saved searches"
            explanation="A search is saved from the research setup screen, once you have chosen modules and filters worth repeating."
            whatWeKnow="Nothing is running on a schedule, so nothing is spending your allowance while you are away."
            actions={[{ label: 'Set up a research run', href: '/discover', primary: true }]}
          />
        ) : (
          <SavedSearchList
            rows={rows.map((row) => ({
              id: row.id,
              name: row.name,
              moduleIds: row.moduleIds,
              cadence: row.cadence,
              paused: row.paused,
              lastRunLabel: row.lastRunAt ? describeAge(row.lastRunAt, 'day') : 'never',
            }))}
          />
        )}
      </PageBody>
    </>
  );
}
