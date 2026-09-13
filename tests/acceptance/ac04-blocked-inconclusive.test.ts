import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium } from '@/server/inspect/chromium';
import { inspectWebsite } from '@/server/inspect/inspect';
import { deriveFindings } from '@/server/inspect/findings';
import { startFixtureServer, type FixtureServer } from '../setup/fixture-server';

/**
 * ACCEPTANCE CASE 4 — "Blocked website inspection: inconclusive assessment, no
 * fabricated defects."
 *
 * This is the case that protects the user's reputation. If a site blocks our
 * crawler and we report that as "no contact route, no viewport tag, thin
 * content", those claims go into an email the user sends under their own name,
 * to a business whose website may be perfectly good.
 *
 * So the assertion is not merely that the outcome is labelled inconclusive —
 * it is that ZERO findings exist, and that the reason is recorded.
 */

let server: FixtureServer;
let browser: Browser;

beforeAll(async () => {
  // Fixtures live on loopback, which the SSRF policy blocks by default. The
  // escape hatch is only honoured under NODE_ENV=test and throws in production.
  process.env.KOVVI_SSRF_ALLOW_LOOPBACK = '1';
  server = await startFixtureServer();
  browser = await launchChromium();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  delete process.env.KOVVI_SSRF_ALLOW_LOOPBACK;
});

describe('a site that refuses automated readers', () => {
  it('is reported as inconclusive, not as broken', async () => {
    const result = await inspectWebsite(server.siteUrl('blocked'), { browser });

    expect(result.outcome).toBe('inconclusive_blocked');
    expect(result.status).toBe(403);
  });

  it('produces NO findings whatsoever', async () => {
    const result = await inspectWebsite(server.siteUrl('blocked'), { browser });
    const findings = deriveFindings(result);

    // The whole case in one assertion. Anything above zero is a fabricated
    // claim about a website we never saw.
    expect(findings).toEqual([]);
  });

  it('reads no pages, so there is nothing to draw conclusions from', async () => {
    const result = await inspectWebsite(server.siteUrl('blocked'), { browser });
    expect(result.pages).toEqual([]);
    expect(result.captures).toEqual([]);
  });

  it('records WHY it was inconclusive, in words a user can act on', async () => {
    const result = await inspectWebsite(server.siteUrl('blocked'), { browser });

    expect(result.inconclusiveDetail).toBeTruthy();
    expect(result.inconclusiveDetail).toMatch(/403/);
    // It must say that nothing was assessed, not merely that something failed.
    expect(result.inconclusiveDetail).toMatch(/nothing was assessed/i);
  });

  it('by contrast, a reachable site DOES produce findings', async () => {
    // The control. Without this, a `deriveFindings` that always returned []
    // would pass every assertion above.
    const result = await inspectWebsite(server.siteUrl('no-contact'), { browser });

    expect(result.outcome).toBe('complete');
    const findings = deriveFindings(result);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((f) => f.ruleKey)).toContain('contact_route_absent');
  });
});
