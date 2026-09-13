import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium } from '@/server/inspect/chromium';
import { inspectWebsite } from '@/server/inspect/inspect';
import { deriveFindings, groupByClassification } from '@/server/inspect/findings';
import { startFixtureServer, type FixtureServer } from '@/server/seed/fixture-server';

/**
 * ACCEPTANCE CASE 14 — "External shop or booking provider: recognize a valid
 * commercial journey instead of claiming the business lacks one."
 *
 * A restaurant that books through OpenTable has a working booking route. A
 * checker that only counts on-site forms sees no booking route and reports a
 * defect — and the user emails a restaurant to tell them they cannot take
 * reservations, which they visibly can.
 *
 * The brief calls this out specifically because it is the most common way an
 * automated website audit produces a confidently wrong result.
 */

let server: FixtureServer;
let browser: Browser;

beforeAll(async () => {
  process.env.KOVVI_SSRF_ALLOW_LOOPBACK = '1';
  server = await startFixtureServer();
  browser = await launchChromium();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  delete process.env.KOVVI_SSRF_ALLOW_LOOPBACK;
});

describe('a venue that books through a third party', () => {
  it('recognises the provider by name', async () => {
    const result = await inspectWebsite(server.siteUrl('external-booking'), { browser });
    expect(result.outcome).toBe('complete');

    const providers = result.pages.flatMap((page) => page.externalProviders);
    expect(providers.map((p) => p.provider)).toContain('OpenTable');
    expect(providers.find((p) => p.provider === 'OpenTable')?.kind).toBe('booking');
  });

  it('records the booking route as a working journey, not a defect', async () => {
    const result = await inspectWebsite(server.siteUrl('external-booking'), { browser });
    const findings = deriveFindings(result);

    const journey = findings.find((f) => f.ruleKey === 'commercial_journey_external');
    expect(journey, 'the external booking route should be recorded').toBeDefined();

    // Not an objective defect. This is the assertion the case exists for.
    expect(journey?.classification).not.toBe('objective_defect');
    expect(journey?.summary).toMatch(/OpenTable/);
  });

  it('does NOT claim the business has no contact route', async () => {
    const result = await inspectWebsite(server.siteUrl('external-booking'), { browser });
    const findings = deriveFindings(result);

    expect(findings.map((f) => f.ruleKey)).not.toContain('contact_route_absent');
  });

  it('keeps the three kinds of claim separate', async () => {
    const result = await inspectWebsite(server.siteUrl('external-booking'), { browser });
    const grouped = groupByClassification(deriveFindings(result));

    // The brief requires objective defects, subjective observations and
    // commercial hypotheses never be blended into one list.
    expect(grouped.subjective_observation.map((f) => f.ruleKey)).toContain(
      'commercial_journey_external',
    );
    for (const finding of grouped.objective_defect) {
      expect(finding.ruleKey).not.toBe('commercial_journey_external');
    }
  });

  it('still reports a genuinely absent contact route elsewhere', async () => {
    // The control: recognising external providers must not have disabled the
    // contact-route rule altogether.
    const result = await inspectWebsite(server.siteUrl('no-contact'), { browser });
    const findings = deriveFindings(result);

    expect(findings.map((f) => f.ruleKey)).toContain('contact_route_absent');

    // And even then, the claim is scoped to what was actually read.
    const finding = findings.find((f) => f.ruleKey === 'contact_route_absent');
    expect(String(finding?.detail.note)).toMatch(/page\(s\)/);
  });

  it('finds the on-site contact route when there is one', async () => {
    const result = await inspectWebsite(server.siteUrl('clean-shop'), { browser });
    const findings = deriveFindings(result);

    expect(findings.map((f) => f.ruleKey)).not.toContain('contact_route_absent');
    expect(result.pages.some((page) => page.hasContactForm)).toBe(true);
    expect(result.pages.flatMap((page) => page.emailLinks)).toContain(
      'hello@meridian-supply.test',
    );
  });
});
