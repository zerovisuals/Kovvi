import type { Metadata } from 'next';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { balanceFor, PLAN_ALLOWANCES } from '@/server/billing/usage';
import { capabilityState } from '@/server/capabilities/registry';
import { MODULES } from '@/server/modules/registry';
import { RunSetup } from '@/components/discover/RunSetup';

export const metadata: Metadata = { title: 'Discover' };

/**
 * RESEARCH SETUP
 *
 * The brief requires a cost estimate and a bounded limit BEFORE anything runs,
 * and honest source coverage rather than a promise of completeness.
 *
 * So this screen leads with what it cannot do. Five of the seven modules are
 * declared but not built, and two discovery sources need credentials that are
 * not present — stating that up front is the difference between a short result
 * set the user can interpret and one they cannot.
 */
export default async function DiscoverPage() {
  const ctx = await requireTenant('/discover');
  // Capability state comes from the environment, so this must be per-request.
  await connection();

  const balance = await balanceFor(getDb(), ctx.workspaceId, 'deep_assessment');
  const searchState = capabilityState('web_search_discovery');

  const modules = MODULES.map((module) => ({
    id: module.id,
    label: module.label,
    description: module.description,
    assessmentFocus: module.assessmentFocus,
    reasonsToInvestigate: module.reasonsToInvestigate,
    filters: module.filters,
    built: module.built,
    coverageNote: module.coverageNote,
    // A module whose only discovery source needs a key it does not have can
    // only work from imported URLs, and the setup screen says which.
    discoveryLive:
      module.discoveryCapabilities.includes('manual_url_import') ||
      searchState.state === 'live',
    needsSearchProvider:
      module.discoveryCapabilities.includes('web_search_discovery') &&
      searchState.state !== 'live',
  }));

  return (
    <>
      <PageHeader
        title="Discover"
        lede="Choose what to look for and what you are willing to spend. Nothing runs until you confirm, and the estimate below is a ceiling rather than a guess."
        meta={
          <>
            <span>{balance} assessments remaining</span>
            <span aria-hidden>·</span>
            <span>{PLAN_ALLOWANCES.pro.deep_assessment} per period on Pro</span>
            <span aria-hidden>·</span>
            <span>{MODULES.filter((module) => module.built).length} of {MODULES.length} modules built</span>
          </>
        }
      />

      <PageBody>
        <RunSetup
          modules={modules}
          balance={balance}
          searchProviderConnected={searchState.state === 'live'}
        />
      </PageBody>
    </>
  );
}
