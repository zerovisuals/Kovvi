import type { ClaimClass } from './types';
import type { InspectionResult, PageObservation } from './inspect';

/**
 * Turning observations into findings.
 *
 * The single most important line in this file is the first guard in
 * `deriveFindings`: an inconclusive inspection produces NO findings, ever.
 * Acceptance case 4 exists because the tempting bug is to treat "we couldn't
 * load it" as "it's broken" — and that failure mode puts a false accusation
 * into an email the user sends under their own name.
 *
 * Every rule declares its `classification` up front, because the difference
 * between an objective defect, a subjective observation and a commercial
 * hypothesis is what the whole product rests on. "No viewport meta tag" is a
 * fact. "The brand feels dated" is an opinion. "They are losing mobile sales"
 * is a guess. They are never presented as the same kind of statement.
 */

export const RULESET_VERSION = 'rules/1';

export type Finding = {
  readonly ruleKey: string;
  readonly classification: ClaimClass;
  /** 1 (minor) to 5 (blocking). Never shown as a score out of 100. */
  readonly severity: number;
  readonly summary: string;
  readonly detail: Record<string, unknown>;
  readonly observedUrl: string | null;
};

function landing(result: InspectionResult): PageObservation | undefined {
  return result.pages[0];
}

/**
 * Derives findings from an inspection.
 *
 * Returns `[]` for any inconclusive or failed outcome — not as a special case
 * bolted on, but as the first thing it does.
 */
export function deriveFindings(result: InspectionResult): readonly Finding[] {
  if (
    result.outcome === 'inconclusive_blocked' ||
    result.outcome === 'inconclusive_timeout' ||
    result.outcome === 'failed'
  ) {
    // We did not see the site. We therefore know nothing about it, and saying
    // otherwise would be inventing evidence.
    return [];
  }

  const home = landing(result);
  if (!home) return [];

  const findings: Finding[] = [];
  const allPages = result.pages;

  /* ── Commercial journey ────────────────────────────────────────────────
     Checked FIRST, because everything below reads differently once we know a
     business sells or takes bookings through a third party. */
  const providers = allPages.flatMap((page) => page.externalProviders);

  if (providers.length > 0) {
    const unique = [...new Map(providers.map((p) => [p.provider, p])).values()];
    findings.push({
      ruleKey: 'commercial_journey_external',
      classification: 'subjective_observation',
      severity: 1,
      summary: `Sells or takes bookings through ${unique.map((p) => p.provider).join(', ')}.`,
      // Acceptance case 14. A functioning external platform is a working
      // commercial journey — recording it as a defect would be simply wrong.
      detail: {
        providers: unique.map((p) => ({ provider: p.provider, kind: p.kind, url: p.url })),
        note: 'A third-party platform is a working commercial route, not a missing one.',
      },
      observedUrl: home.url,
    });
  }

  /* ── Contact route ─────────────────────────────────────────────────────── */
  const hasContactForm = allPages.some((page) => page.hasContactForm);
  const hasEmail = allPages.some((page) => page.emailLinks.length > 0);
  const hasPhone = allPages.some((page) => page.telLinks.length > 0);
  const hasScheduling = providers.some((p) => p.kind === 'scheduling' || p.kind === 'booking');

  if (!hasContactForm && !hasEmail && !hasPhone && !hasScheduling) {
    findings.push({
      ruleKey: 'contact_route_absent',
      classification: 'objective_defect',
      severity: 4,
      summary: 'No contact route found on the pages that were read.',
      detail: {
        pagesChecked: allPages.length,
        // Scoped honestly: we did not read the whole site.
        note: `Checked ${allPages.length} page(s). A contact route on a page not reached would not appear here.`,
      },
      observedUrl: home.url,
    });
  }

  /* ── Mobile ────────────────────────────────────────────────────────────── */
  if (!home.viewportMetaPresent) {
    findings.push({
      ruleKey: 'viewport_meta_absent',
      classification: 'objective_defect',
      severity: 4,
      summary: 'No viewport meta tag, so the page is not laid out for mobile screens.',
      detail: { url: home.url },
      observedUrl: home.url,
    });
  }

  const overflowing = allPages.filter((page) => page.overflowsAtMobile);
  if (overflowing.length > 0) {
    findings.push({
      ruleKey: 'horizontal_overflow_mobile',
      classification: 'objective_defect',
      severity: 3,
      summary: `${overflowing.length} page(s) scroll sideways at 390px wide.`,
      detail: { urls: overflowing.map((page) => page.url) },
      observedUrl: overflowing[0]?.url ?? home.url,
    });
  }

  /* ── Content ───────────────────────────────────────────────────────────── */
  if (home.wordCount < 40) {
    findings.push({
      ruleKey: 'landing_page_thin',
      classification: 'subjective_observation',
      severity: 2,
      summary: `The landing page carries ${home.wordCount} words of text.`,
      detail: {
        wordCount: home.wordCount,
        // Said plainly, because a thin landing page is often a deliberate
        // choice and calling it a defect would be overreach.
        note: 'Text-light pages can be deliberate; this is an observation, not a defect.',
      },
      observedUrl: home.url,
    });
  }

  if (!home.title) {
    findings.push({
      ruleKey: 'title_absent',
      classification: 'objective_defect',
      severity: 3,
      summary: 'The landing page has no title element.',
      detail: { url: home.url },
      observedUrl: home.url,
    });
  }

  if (home.headingCount === 0) {
    findings.push({
      ruleKey: 'headings_absent',
      classification: 'objective_defect',
      severity: 2,
      summary: 'No headings on the landing page, which affects both structure and search.',
      detail: { url: home.url },
      observedUrl: home.url,
    });
  }

  /* ── Redirects ─────────────────────────────────────────────────────────── */
  if (result.redirectChain.length > 2) {
    findings.push({
      ruleKey: 'redirect_chain_long',
      classification: 'objective_defect',
      severity: 2,
      summary: `Reaching the site takes ${result.redirectChain.length} redirects.`,
      detail: { chain: result.redirectChain },
      observedUrl: result.startUrl,
    });
  }

  return findings;
}

/** Split for display; the brief requires these never be blended together. */
export function groupByClassification(
  findings: readonly Finding[],
): Record<ClaimClass, readonly Finding[]> {
  return {
    objective_defect: findings.filter((f) => f.classification === 'objective_defect'),
    subjective_observation: findings.filter((f) => f.classification === 'subjective_observation'),
    commercial_hypothesis: findings.filter((f) => f.classification === 'commercial_hypothesis'),
  };
}
