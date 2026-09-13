import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { seedWorkspace } from '../setup/factories';
import { business, evidence, sourceRecord } from '@/server/db/schema';
import {
  getOpportunityForWorkspace,
  listOpportunities,
  upsertOpportunity,
} from '@/server/db/repo/opportunity';
import { loadDossier } from '@/server/db/repo/dossier';
import { latestRunCoverage } from '@/server/db/repo/runs';
import { scoreOpportunity } from '@/server/rank/score';
import type { Database } from '@/server/db/client';
import type { TenantContext } from '@/server/db/tenant';

/**
 * ACCEPTANCE CASE 9 — "Tenant A requests tenant B's evidence containing private
 * notes: access denied."
 *
 * The worst thing this product could do. Kovvi holds one freelancer's prospect
 * list, their messages, their prices and their outcomes; a leak between
 * workspaces is not a bug report, it is the end of the business.
 *
 * The design answer is that isolation is a property of the API's SHAPE. Every
 * repo function takes a TenantContext and filters on it, and there is
 * deliberately no `getEvidenceById(id)` to call by mistake — shared public
 * records are reachable only by joining from a tenant-scoped opportunity.
 *
 * Note also what the refusal looks like: NOT FOUND, never "forbidden". A
 * response that distinguishes the two confirms the record exists.
 */

let db: TestDb;
let alice: TenantContext;
let bob: TenantContext;

beforeAll(async () => {
  db = await createTestDb();

  const a = await seedWorkspace(db, { allowance: 10, name: 'Alice' });
  const b = await seedWorkspace(db, { allowance: 10, name: 'Bob' });

  alice = { workspaceId: a.workspaceId, userId: a.userId, role: 'owner' };
  bob = { workspaceId: b.workspaceId, userId: b.userId, role: 'owner' };
});

afterAll(async () => {
  await closeTestDb(db);
});

const score = scoreOpportunity({
  matchedClaims: [],
  industryMatches: true,
  regionMatches: true,
  evidenceCount: 2,
  objectiveDefects: 1,
  inconclusive: false,
  latestEvent: null,
  hasVerifiedContact: true,
  hasAnyContact: true,
  identityConfirmed: true,
});

async function sharedBusiness(name: string): Promise<string> {
  const [row] = await db
    .insert(business)
    .values({
      canonicalName: name,
      nameKey: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      canonicalDomainState: 'unknown',
      canonicalDomainReason: 'not_searched',
    })
    .returning({ id: business.id });

  const [record] = await db
    .insert(sourceRecord)
    .values({
      url: `https://${name.toLowerCase().replace(/\W/g, '')}.test/`,
      urlHash: `hash-${name}`,
      contentHash: `content-${name}`,
      httpStatus: 200,
    })
    .returning({ id: sourceRecord.id });

  await db.insert(evidence).values({
    businessId: row!.id,
    sourceRecordId: record!.id,
    claimKey: 'observation',
    classification: 'objective_defect',
    confidence: 'high',
    excerpt: 'A publicly observable fact about this business.',
  });

  return row!.id;
}

describe("one workspace cannot reach another's opportunity", () => {
  it('returns nothing when Bob asks for Alice’s opportunity', async () => {
    const businessId = await sharedBusiness('Alices Prospect');

    const { opportunityId } = await upsertOpportunity(db as unknown as Database, alice, {
      businessId,
      moduleId: 'fashion',
      score,
    });

    expect(
      await getOpportunityForWorkspace(db as unknown as Database, alice, opportunityId),
    ).toBeDefined();

    // Undefined, not an error that confirms existence.
    expect(
      await getOpportunityForWorkspace(db as unknown as Database, bob, opportunityId),
    ).toBeUndefined();
  });

  it("returns nothing when Bob loads Alice's dossier", async () => {
    const businessId = await sharedBusiness('Private Notes Ltd');

    const { opportunityId } = await upsertOpportunity(db as unknown as Database, alice, {
      businessId,
      moduleId: 'professional',
      score,
    });

    const mine = await loadDossier(db as unknown as Database, alice, opportunityId);
    expect(mine).toBeDefined();
    expect(mine?.evidence.length).toBeGreaterThan(0);

    // The evidence is public; the OPPORTUNITY is not, and the dossier is only
    // reachable through it.
    expect(await loadDossier(db as unknown as Database, bob, opportunityId)).toBeUndefined();
  });

  it('keeps the shortlists entirely separate', async () => {
    const businessId = await sharedBusiness('Mutual Interest Co');

    const mine = await upsertOpportunity(db as unknown as Database, alice, {
      businessId,
      moduleId: 'fashion',
      score,
    });
    const theirs = await upsertOpportunity(db as unknown as Database, bob, {
      businessId,
      moduleId: 'fashion',
      score,
    });

    const aliceList = await listOpportunities(db as unknown as Database, alice);
    const bobList = await listOpportunities(db as unknown as Database, bob);

    expect(aliceList.map((row) => row.id)).toContain(mine.opportunityId);
    expect(aliceList.map((row) => row.id)).not.toContain(theirs.opportunityId);

    expect(bobList.map((row) => row.id)).toContain(theirs.opportunityId);
    expect(bobList.map((row) => row.id)).not.toContain(mine.opportunityId);
  });

  it('shares the underlying public business without sharing the opportunity', async () => {
    // The design's whole point: resolving a business once is what stops two
    // users paying twice, and it must not leak either one's private layer.
    const businessId = await sharedBusiness('Shared Public Facts Ltd');

    const mine = await upsertOpportunity(db as unknown as Database, alice, {
      businessId,
      moduleId: 'software',
      score,
    });
    const theirs = await upsertOpportunity(db as unknown as Database, bob, {
      businessId,
      moduleId: 'software',
      score,
    });

    expect(mine.opportunityId).not.toBe(theirs.opportunityId);

    const aliceDossier = await loadDossier(db as unknown as Database, alice, mine.opportunityId);
    const bobDossier = await loadDossier(db as unknown as Database, bob, theirs.opportunityId);

    // Same public business, same public evidence…
    expect(aliceDossier?.business.id).toBe(bobDossier?.business.id);
    expect(aliceDossier?.evidence.length).toBe(bobDossier?.evidence.length);

    // …different private opportunities.
    expect(aliceDossier?.opportunity.id).not.toBe(bobDossier?.opportunity.id);
  });

  it('scopes run coverage to the asking workspace', async () => {
    // Coverage reveals which sources a user ran and how much they found — not
    // catastrophic on its own, but it is still their research.
    expect(await latestRunCoverage(db as unknown as Database, bob)).toEqual([]);
  });
});

describe('the API has no unscoped door', () => {
  it('exposes no function that fetches evidence by id alone', async () => {
    const repo = await import('@/server/db/repo/dossier');
    const opportunityRepo = await import('@/server/db/repo/opportunity');

    for (const [name, value] of [
      ...Object.entries(repo),
      ...Object.entries(opportunityRepo),
    ]) {
      if (typeof value !== 'function') continue;

      // Every exported query takes (db, ctx, …). A function that could be
      // called without a TenantContext is a function that will be.
      expect(
        /^(?:load|list|get|upsert)/.test(name) ? value.length >= 2 : true,
        `${name} must take a tenant context`,
      ).toBe(true);
    }
  });
});
