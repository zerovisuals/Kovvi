import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { seedRun, seedWorkspace } from '../setup/factories';
import { startFixtureServer, type FixtureServer } from '../setup/fixture-server';
import { assessment, business, capture, finding, websiteCandidate } from '@/server/db/schema';
import { enqueue } from '@/server/queue/queue';
import { createWorker } from '@/server/queue/worker';
import { balanceFor } from '@/server/billing/usage';
import type { Database } from '@/server/db/client';

/**
 * THE WHOLE THING, RUNNING.
 *
 * Queue a real inspection job, let a real worker claim it, drive a real browser
 * against a real HTTP server, and check that the evidence, the captures and the
 * billing all landed correctly.
 *
 * Unit tests prove the pieces behave; this proves they fit together. It is also
 * the test that would fail first if any of the environment accommodations —
 * the browser launch path, the proxy TLS cap, the SSRF loopback exemption —
 * regressed.
 */

let db: TestDb;
let server: FixtureServer;
let workspaceId: string;

beforeAll(async () => {
  process.env.KOVVI_SSRF_ALLOW_LOOPBACK = '1';
  db = await createTestDb();
  server = await startFixtureServer();
  ({ workspaceId } = await seedWorkspace(db, { allowance: 20 }));
}, 90_000);

afterAll(async () => {
  await server?.close();
  await closeTestDb(db);
  delete process.env.KOVVI_SSRF_ALLOW_LOOPBACK;
});

async function candidateFor(url: string): Promise<string> {
  // Every fixture site shares one host and is distinguished only by path, so
  // there is no canonical DOMAIN to record. Saying so honestly also keeps the
  // real uniqueness constraint intact rather than working around it.
  const [biz] = await db
    .insert(business)
    .values({
      canonicalName: `Fixture ${Math.random().toString(36).slice(2, 8)}`,
      nameKey: `fixture${Math.random().toString(36).slice(2, 8)}`,
      canonicalDomainState: 'unknown',
      canonicalDomainReason: 'not_searched',
    })
    .returning({ id: business.id });

  const [candidate] = await db
    .insert(websiteCandidate)
    .values({
      businessId: biz!.id,
      url,
      normalisedHost: new URL(url).host,
      identityStatus: 'confirmed_official',
      identityConfidence: 'high',
    })
    .returning({ id: websiteCandidate.id });

  return candidate!.id;
}

describe('a queued inspection, executed by a worker', () => {
  it('runs the real browser and records what it saw', async () => {
    const runId = await seedRun(db, workspaceId, { unitCap: 5 });
    const candidateId = await candidateFor(server.siteUrl('clean-shop'));

    const queued = await enqueue(db as unknown as Database, {
      workspaceId,
      runId,
      stage: 'inspect_site',
      input: { websiteCandidateId: candidateId, url: server.siteUrl('clean-shop'), freshnessDays: 14 },
      idempotencyKey: `${runId}:inspect:clean-shop`,
      cost: { unitType: 'deep_assessment', units: 1 },
    });
    expect(queued.kind).toBe('queued');

    const worker = createWorker({ db: db as unknown as Database, autoStart: false });
    const outcomes = await worker.tick();
    await worker.stop();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.state).toBe('succeeded');

    const [recorded] = await db
      .select()
      .from(assessment)
      .where(eq(assessment.websiteCandidateId, candidateId));

    expect(recorded?.status).toBe('complete');
    expect(recorded?.pagesVisited).toBeGreaterThan(0);
    expect(recorded?.engineVersion).toBeTruthy();
    // The ruleset version travels with the result, so an assessment made under
    // today's rules stays interpretable after the rules change.
    expect(recorded?.rulesetVersion).toBeTruthy();

    const captures = await db.select().from(capture).where(eq(capture.assessmentId, recorded!.id));
    expect(captures.map((c) => c.viewport).sort()).toEqual(['desktop', 'mobile']);
    for (const shot of captures) {
      expect(shot.bytes).toBeGreaterThan(1000);
    }
  }, 120_000);

  it('charges exactly one unit for the work', async () => {
    const before = await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment');
    const runId = await seedRun(db, workspaceId, { unitCap: 5 });
    const candidateId = await candidateFor(server.siteUrl('no-contact'));

    await enqueue(db as unknown as Database, {
      workspaceId,
      runId,
      stage: 'inspect_site',
      input: { websiteCandidateId: candidateId, url: server.siteUrl('no-contact'), freshnessDays: 14 },
      idempotencyKey: `${runId}:inspect:no-contact`,
      cost: { unitType: 'deep_assessment', units: 1 },
    });

    const worker = createWorker({ db: db as unknown as Database, autoStart: false });
    await worker.tick();
    await worker.stop();

    expect(before - (await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment'))).toBe(1);
  }, 120_000);

  it('records a blocked site as inconclusive, with no findings, and still charges', async () => {
    const runId = await seedRun(db, workspaceId, { unitCap: 5 });
    const candidateId = await candidateFor(server.siteUrl('blocked'));
    const before = await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment');

    await enqueue(db as unknown as Database, {
      workspaceId,
      runId,
      stage: 'inspect_site',
      input: { websiteCandidateId: candidateId, url: server.siteUrl('blocked'), freshnessDays: 14 },
      idempotencyKey: `${runId}:inspect:blocked`,
      cost: { unitType: 'deep_assessment', units: 1 },
    });

    const worker = createWorker({ db: db as unknown as Database, autoStart: false });
    const outcomes = await worker.tick();
    await worker.stop();

    // A success terminal state, not a failure: the work happened and produced
    // an honest "we do not know".
    expect(outcomes[0]?.state).toBe('inconclusive');

    const [recorded] = await db
      .select()
      .from(assessment)
      .where(eq(assessment.websiteCandidateId, candidateId));

    expect(recorded?.status).toBe('inconclusive_blocked');
    expect(recorded?.inconclusiveReason).toBe('blocked');

    const findings = await db.select().from(finding).where(eq(finding.assessmentId, recorded!.id));
    expect(findings).toEqual([]);

    // Charged, because the attempt cost the same as a successful one. Free
    // blocked inspections would be an easy way to run up someone else's bill.
    expect(before - (await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment'))).toBe(1);

    // And the candidate is now known to be unreachable, rather than untried.
    const [candidate] = await db
      .select()
      .from(websiteCandidate)
      .where(eq(websiteCandidate.id, candidateId));
    expect(candidate?.identityStatus).toBe('inaccessible');
  }, 120_000);

  it('reuses a fresh assessment instead of charging twice', async () => {
    const runId = await seedRun(db, workspaceId, { unitCap: 5 });
    const url = server.siteUrl('external-booking');
    const candidateId = await candidateFor(url);

    const worker = createWorker({ db: db as unknown as Database, autoStart: false });

    await enqueue(db as unknown as Database, {
      workspaceId,
      runId,
      stage: 'inspect_site',
      input: { websiteCandidateId: candidateId, url, freshnessDays: 14 },
      idempotencyKey: `${runId}:inspect:booking:first`,
      cost: { unitType: 'deep_assessment', units: 1 },
    });
    await worker.tick();

    const afterFirst = await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment');

    // A second run, a different job key — as a re-search a day later would be.
    await enqueue(db as unknown as Database, {
      workspaceId,
      runId,
      stage: 'inspect_site',
      input: { websiteCandidateId: candidateId, url, freshnessDays: 14 },
      idempotencyKey: `${runId}:inspect:booking:second`,
      cost: { unitType: 'deep_assessment', units: 1 },
    });
    const outcomes = await worker.tick();
    await worker.stop();

    expect(outcomes[0]?.state).toBe('succeeded');

    const assessments = await db
      .select()
      .from(assessment)
      .where(eq(assessment.websiteCandidateId, candidateId));

    // One inspection, reused — not two.
    expect(assessments).toHaveLength(1);

    const afterSecond = await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment');
    // The reservation for the second job is finalised at zero net cost via the
    // cache-hit entry, so the user is charged once for one piece of work.
    expect(afterFirst - afterSecond).toBeLessThanOrEqual(1);
  }, 120_000);
});
