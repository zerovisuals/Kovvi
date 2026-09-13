import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { seedWorkspace } from '../setup/factories';
import { business, opportunity, opportunityModuleHit } from '@/server/db/schema';
import { listOpportunities, upsertOpportunity } from '@/server/db/repo/opportunity';
import { scoreOpportunity } from '@/server/rank/score';
import type { Database } from '@/server/db/client';
import type { TenantContext } from '@/server/db/tenant';

/**
 * ACCEPTANCE CASE 15 — "Cross-module duplicate: the same apparel/esports
 * business is one prospect, not charged twice for the same completed
 * assessment."
 *
 * An apparel brand that also fields an esports team is found by the fashion
 * module and again by the esports module. It has one website, one inbox and one
 * person who reads it. Presenting it twice would waste the freelancer's review
 * time and — worse — invite them to send two near-identical emails to the same
 * address.
 */

let db: TestDb;
let ctx: TenantContext;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

beforeEach(async () => {
  const seeded = await seedWorkspace(db, { allowance: 50 });
  ctx = { workspaceId: seeded.workspaceId, userId: seeded.userId, role: 'owner' };
});

async function makeBusiness(name: string): Promise<string> {
  const [row] = await db
    .insert(business)
    .values({
      canonicalName: name,
      nameKey: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      canonicalDomainState: 'unknown',
      canonicalDomainReason: 'not_searched',
      industryModuleIds: ['fashion', 'esports'],
    })
    .returning({ id: business.id });

  return row!.id;
}

const score = scoreOpportunity({
  matchedClaims: [{ value: 'ecommerce', claimId: 'clm_1' }],
  industryMatches: true,
  regionMatches: true,
  evidenceCount: 3,
  objectiveDefects: 1,
  inconclusive: false,
  latestEvent: { date: new Date(), type: 'collection_launch' },
  hasVerifiedContact: true,
  hasAnyContact: true,
  identityConfirmed: true,
});

describe('one business, found by two modules', () => {
  it('creates a single opportunity', async () => {
    const businessId = await makeBusiness('Vantage Apparel');

    const first = await upsertOpportunity(db as unknown as Database, ctx, {
      businessId,
      moduleId: 'fashion',
      score,
    });
    const second = await upsertOpportunity(db as unknown as Database, ctx, {
      businessId,
      moduleId: 'esports',
      score,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.opportunityId).toBe(first.opportunityId);

    const rows = await db
      .select()
      .from(opportunity)
      .where(eq(opportunity.workspaceId, ctx.workspaceId));
    expect(rows).toHaveLength(1);
  });

  it('records BOTH modules, so the UI can say where it came from', async () => {
    const businessId = await makeBusiness('Vantage Apparel Two');

    await upsertOpportunity(db as unknown as Database, ctx, {
      businessId,
      moduleId: 'fashion',
      score,
    });
    const second = await upsertOpportunity(db as unknown as Database, ctx, {
      businessId,
      moduleId: 'esports',
      score,
    });

    expect([...second.moduleIds].sort()).toEqual(['esports', 'fashion']);

    const hits = await db
      .select()
      .from(opportunityModuleHit)
      .where(eq(opportunityModuleHit.opportunityId, second.opportunityId));
    expect(hits).toHaveLength(2);
  });

  it('appears once in the shortlist, labelled with both modules', async () => {
    const businessId = await makeBusiness('Vantage Apparel Three');

    await upsertOpportunity(db as unknown as Database, ctx, {
      businessId,
      moduleId: 'fashion',
      score,
    });
    await upsertOpportunity(db as unknown as Database, ctx, {
      businessId,
      moduleId: 'esports',
      score,
    });

    const shortlist = await listOpportunities(db as unknown as Database, ctx);
    const row = shortlist.find((item) => item.businessName === 'Vantage Apparel Three');

    expect(shortlist.filter((item) => item.businessName === 'Vantage Apparel Three')).toHaveLength(1);
    expect([...(row?.moduleIds ?? [])].sort()).toEqual(['esports', 'fashion']);
  });

  it('is idempotent when one module surfaces it repeatedly', async () => {
    const businessId = await makeBusiness('Vantage Apparel Four');

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await upsertOpportunity(db as unknown as Database, ctx, {
        businessId,
        moduleId: 'fashion',
        score,
      });
    }

    const opportunities = await db
      .select()
      .from(opportunity)
      .where(eq(opportunity.businessId, businessId));
    expect(opportunities).toHaveLength(1);

    const hits = await db
      .select()
      .from(opportunityModuleHit)
      .where(eq(opportunityModuleHit.opportunityId, opportunities[0]!.id));
    expect(hits).toHaveLength(1);
  });

  it('keeps two DIFFERENT businesses separate', async () => {
    // The control: dedupe must not be so eager that it merges distinct
    // prospects, which would be a far worse failure than showing one twice.
    const a = await makeBusiness('Distinct One');
    const b = await makeBusiness('Distinct Two');

    const first = await upsertOpportunity(db as unknown as Database, ctx, {
      businessId: a,
      moduleId: 'fashion',
      score,
    });
    const second = await upsertOpportunity(db as unknown as Database, ctx, {
      businessId: b,
      moduleId: 'fashion',
      score,
    });

    expect(first.opportunityId).not.toBe(second.opportunityId);
    expect(second.created).toBe(true);
  });

  it('keeps the same business separate BETWEEN workspaces', async () => {
    // One shared public business, two private opportunities. Deduping across
    // workspaces would leak one user's prospect list into another's.
    const businessId = await makeBusiness('Shared Prospect');
    const other = await seedWorkspace(db, { allowance: 10 });
    const otherCtx: TenantContext = {
      workspaceId: other.workspaceId,
      userId: other.userId,
      role: 'owner',
    };

    const mine = await upsertOpportunity(db as unknown as Database, ctx, {
      businessId,
      moduleId: 'fashion',
      score,
    });
    const theirs = await upsertOpportunity(db as unknown as Database, otherCtx, {
      businessId,
      moduleId: 'fashion',
      score,
    });

    expect(mine.opportunityId).not.toBe(theirs.opportunityId);
    expect(theirs.created).toBe(true);

    const mineList = await listOpportunities(db as unknown as Database, ctx);
    expect(mineList.map((row) => row.id)).not.toContain(theirs.opportunityId);
  });
});
