import type { Metadata } from 'next';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { ProductState } from '@/components/state/ProductState';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { balanceFor, PLAN_ALLOWANCES } from '@/server/billing/usage';
import { usageHistory } from '@/server/account/operations';
import { capabilityState } from '@/server/capabilities/registry';

export const metadata: Metadata = { title: 'Billing and usage' };

const KIND_LABEL: Record<string, string> = {
  grant: 'Allowance granted',
  reserve: 'Reserved for work',
  finalise: 'Work completed',
  refund: 'Refunded',
  expire: 'Expired',
};

/**
 * Billing and usage.
 *
 * The ledger is shown in full rather than summarised into a single number.
 * A balance that is the sum of visible movements can be explained; a counter
 * cannot, and "why did that cost me three assessments" is the question this
 * screen exists to answer.
 */
export default async function BillingPage() {
  const ctx = await requireTenant('/settings/billing');
  await connection();

  const db = getDb();
  const [balance, ledger] = await Promise.all([
    balanceFor(db, ctx.workspaceId, 'deep_assessment'),
    usageHistory(db, ctx, 50),
  ]);

  const billingLive = capabilityState('billing').state === 'live';
  const allowance = PLAN_ALLOWANCES.pro.deep_assessment;
  const used = Math.max(0, allowance - balance);

  const inconclusiveCharges = ledger.filter(
    (row) => row.kind === 'finalise' && (row.note?.includes('Inconclusive') ?? false),
  );
  const cacheHits = ledger.filter((row) => row.note?.includes('Reused an assessment') ?? false);

  return (
    <>
      <PageHeader
        title="Billing and usage"
        lede="Every movement of your allowance, in full. The balance is the sum of what you can see below — not a counter you have to trust."
        meta={
          <>
            <span>{balance} of {allowance} remaining</span>
            <span aria-hidden>·</span>
            <span>{ledger.length} entries</span>
          </>
        }
      />

      <PageBody>
        {!billingLive ? (
          <div className="mb-10">
            <ProductState state="subscription_inactive" variant="blocking" />
          </div>
        ) : null}

        <section className="max-w-(--spacing-measure)">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Allowance</h2>

          <div className="bg-sunken mt-3 h-2 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full"
              style={{ width: `${Math.min(100, (used / allowance) * 100)}%` }}
            />
          </div>
          <p className="text-ink-muted mt-2 font-mono text-2xs">
            {used} used · {balance} remaining · resets each billing period
          </p>

          {inconclusiveCharges.length > 0 ? (
            <p className="text-ink-muted mt-4 text-sm text-pretty">
              {inconclusiveCharges.length} assessment
              {inconclusiveCharges.length === 1 ? '' : 's'} finished inconclusive and{' '}
              {inconclusiveCharges.length === 1 ? 'was' : 'were'} still charged. Loading a site that
              blocked us costs the same as one that did not — this line is shown rather than buried.
            </p>
          ) : null}

          {cacheHits.length > 0 ? (
            <p className="text-ink-muted mt-2 text-sm text-pretty">
              {cacheHits.length} result{cacheHits.length === 1 ? '' : 's'} reused a recent
              assessment and cost nothing.
            </p>
          ) : null}
        </section>

        <section className="mt-12">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Ledger</h2>

          {ledger.length === 0 ? (
            <p className="text-ink-muted mt-3 text-sm">Nothing recorded yet.</p>
          ) : (
            <table className="mt-3 w-full text-left">
              <thead>
                <tr className="rule-b text-2xs text-ink-faint font-mono tracking-wide uppercase">
                  <th className="py-2 pr-4 font-normal">When</th>
                  <th className="py-2 pr-4 font-normal">What</th>
                  <th className="py-2 pr-4 font-normal">Note</th>
                  <th className="py-2 text-right font-normal">Units</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="rule-b">
                    <td className="text-ink-faint py-2 pr-4 font-mono text-2xs whitespace-nowrap">
                      {row.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-2 pr-4 text-sm">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="text-ink-muted py-2 pr-4 text-sm text-pretty">{row.note ?? '—'}</td>
                    <td
                      data-numeric
                      className={`py-2 text-right font-mono text-sm tabular-nums ${
                        row.units > 0 ? 'text-positive' : row.units < 0 ? 'text-ink' : 'text-ink-faint'
                      }`}
                    >
                      {row.units > 0 ? `+${row.units}` : row.units}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rule-t mt-12 pt-8 pb-16">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Your data</h2>
          <p className="text-ink-muted mt-2 max-w-(--spacing-measure) text-sm text-pretty">
            Export and deletion work regardless of billing state. Leaving should be as easy as
            arriving.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/api/export/opportunities"
              className="border-line-strong ease-out inline-flex items-center rounded-sm border px-3 py-1.5 text-sm transition-colors duration-instant hover:bg-sunken"
            >
              Export opportunities (CSV)
            </a>
            <a
              href="/settings/data"
              className="border-line-strong ease-out inline-flex items-center rounded-sm border px-3 py-1.5 text-sm transition-colors duration-instant hover:bg-sunken"
            >
              Audit log and deletion
            </a>
          </div>
        </section>
      </PageBody>
    </>
  );
}
