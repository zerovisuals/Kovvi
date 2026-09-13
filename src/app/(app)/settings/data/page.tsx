import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { auditHistory } from '@/server/account/operations';

export const metadata: Metadata = { title: 'Data' };

/**
 * The user-visible audit log.
 *
 * The brief asks for a user-visible audit history, not a log file. A user who
 * cannot see what the system did on their behalf has no basis for trusting it,
 * and "we keep records" is not the same as "here they are".
 */
export default async function DataPage() {
  const ctx = await requireTenant('/settings/data');
  const events = await auditHistory(getDb(), ctx, 100);

  return (
    <>
      <PageHeader
        title="Data"
        lede="Everything Kovvi has done on your behalf, and how to take it with you or remove it."
        meta={<span>{events.length} recorded events</span>}
      />

      <PageBody>
        <section className="max-w-(--spacing-measure)">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Export</h2>
          <p className="text-ink-muted mt-2 text-sm text-pretty">
            A CSV of every opportunity in this workspace, including a{' '}
            <code className="font-mono text-xs">data_origin</code> column so sample rows stay
            identifiable outside the app.
          </p>
          <a
            href="/api/export/opportunities"
            className="border-line-strong ease-out mt-3 inline-flex items-center rounded-sm border px-3 py-1.5 text-sm transition-colors duration-instant hover:bg-sunken"
          >
            Download CSV
          </a>
        </section>

        <section className="rule-t mt-10 pt-8">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Audit log</h2>

          {events.length === 0 ? (
            <p className="text-ink-muted mt-3 text-sm">Nothing recorded yet.</p>
          ) : (
            <ul className="rule-t mt-3">
              {events.map((event) => (
                <li key={event.id} className="rule-b flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
                  <span className="text-ink-faint font-mono text-2xs whitespace-nowrap">
                    {event.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </span>
                  <span className="font-mono text-xs">{event.action}</span>
                  {event.subjectType ? (
                    <span className="text-ink-muted text-xs">{event.subjectType}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rule-t mt-10 pt-8 pb-16">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Deletion</h2>
          <p className="text-ink-muted mt-2 max-w-(--spacing-measure) text-sm text-pretty">
            Deleting this workspace removes your opportunities, messages, conversations, outcomes
            and stored screenshots. Public facts about real businesses are kept — they contain
            nothing of yours, and removing them would degrade other people&rsquo;s research for no
            benefit to you. A record that the deletion happened survives, so the claim is auditable.
          </p>
          <p className="text-ink-faint mt-3 font-mono text-2xs">
            Wired to the confirmation flow in the next phase; the operation itself is implemented and
            tested.
          </p>
        </section>
      </PageBody>
    </>
  );
}
