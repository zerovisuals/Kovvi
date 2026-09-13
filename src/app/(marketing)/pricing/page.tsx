import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { PLAN_ALLOWANCES } from '@/server/billing/usage';
import { capabilityState } from '@/server/capabilities/registry';

export const metadata: Metadata = { title: 'Pricing' };

/**
 * Pricing.
 *
 * The allowance numbers come from the same constant the runtime meters against,
 * so the page cannot drift from what the product actually enforces. The brief
 * is explicit that these limits are provisional until measured against real
 * costs, and saying so is more useful to a prospective customer than a
 * confident number that later moves.
 */
export default async function PricingPage() {
  await connection();
  const billingLive = capabilityState('billing').state === 'live';

  return (
    <main id="main" className="mx-auto max-w-4xl px-6 py-20 md:px-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">One plan.</h1>
      <p className="text-ink-muted mt-4 max-w-(--spacing-measure) text-lg text-pretty">
        Kovvi is one service. Working across several industries does not cost extra, because the
        research is the same work either way.
      </p>

      <div className="border-line-strong mt-12 rounded-md border p-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-display text-3xl font-semibold tabular-nums" data-numeric>
            €65
          </span>
          <span className="text-ink-muted">per month</span>
        </div>

        <ul className="mt-8 flex flex-col gap-3 text-sm">
          <Row label="Deep organization assessments" value={`${PLAN_ALLOWANCES.pro.deep_assessment} per month`} />
          <Row label="Outreach drafts" value={`${PLAN_ALLOWANCES.pro.llm_draft} per month`} />
          <Row label="Discovery queries" value={`${PLAN_ALLOWANCES.pro.search_query} per month`} />
          <Row label="Saved searches" value="3" />
          <Row label="Connected email account" value="1" />
        </ul>

        <div className="rule-t mt-8 pt-6">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
            How the allowance is spent
          </h2>
          <ul className="text-ink-muted mt-3 flex flex-col gap-2 text-sm">
            <li>· One assessment per organization whose site is loaded and captured.</li>
            <li>
              · A site that blocks us still costs one. The attempt is the same work, and free
              blocked inspections would be an easy way to run up someone else&rsquo;s bill.
            </li>
            <li>· Reusing a recent assessment costs nothing, and the ledger says so.</li>
            <li>· Work that fails is refunded automatically. You do not pay for our bugs.</li>
            <li>· Every movement is visible in the ledger. The balance is their sum.</li>
          </ul>
        </div>

        <p className="text-ink-faint mt-6 text-sm text-pretty">
          These limits are provisional. The brief this product was built from is explicit that
          allowances should be set from measured costs rather than guessed, and they have not been
          measured against real usage yet. If they move, it will be said plainly rather than
          discovered at renewal.
        </p>

        <Link
          href="/sign-up"
          className="bg-accent text-accent-ink ease-out mt-8 inline-flex h-11 items-center rounded-sm px-5 text-sm font-medium transition-opacity duration-instant hover:opacity-90"
        >
          Start
        </Link>

        {!billingLive ? (
          <p className="text-ink-faint mt-4 font-mono text-2xs">
            Billing is not connected on this deployment. Signing up works, usage is metered for
            real, and nothing is charged.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="rule-b flex items-baseline justify-between gap-4 pb-3">
      <span>{label}</span>
      <span className="text-ink-muted font-mono text-xs tabular-nums" data-numeric>
        {value}
      </span>
    </li>
  );
}
