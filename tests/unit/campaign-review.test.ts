import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { seedWorkspace } from '../setup/factories';
import {
  approval,
  business,
  campaign,
  contact,
  evidence,
  message,
  sourceRecord,
} from '@/server/db/schema';
import { upsertOpportunity } from '@/server/db/repo/opportunity';
import { loadCampaignReview } from '@/server/db/repo/outreach';
import { scoreOpportunity } from '@/server/rank/score';
import { hashValue } from '@/server/email/dispatch';
import type { Database } from '@/server/db/client';
import type { TenantContext } from '@/server/db/tenant';

/**
 * THE REVIEW SCREEN'S READ.
 *
 * The brief requires the user to see the actual batch before approving, and
 * approval to lapse when a message is edited. Both of those are properties of
 * what this query returns, so they are tested here rather than through the UI:
 * a component can only show what the read gives it.
 *
 * The critical case is the third one. `approvedForThisVersion` is computed by
 * comparing hashes, not by reading a boolean somebody has to remember to clear.
 */

let db: TestDb;
let ctx: TenantContext;

beforeAll(async () => {
  db = await createTestDb();
  const seeded = await seedWorkspace(db, { allowance: 20 });
  ctx = { workspaceId: seeded.workspaceId, userId: seeded.userId, role: 'owner' };
});

afterAll(async () => {
  await closeTestDb(db);
});

const score = scoreOpportunity({
  matchedClaims: [],
  industryMatches: true,
  regionMatches: true,
  evidenceCount: 1,
  objectiveDefects: 1,
  inconclusive: false,
  latestEvent: null,
  hasVerifiedContact: false,
  hasAnyContact: true,
  identityConfirmed: true,
});

async function aMessage(body: string, options: { approveIt?: boolean } = {}) {
  const token = Math.random().toString(36).slice(2, 9);

  const [record] = await db
    .insert(sourceRecord)
    .values({
      url: `https://review-${token}.test/`,
      urlHash: `hash-${token}`,
      contentHash: `content-${token}`,
      httpStatus: 200,
    })
    .returning({ id: sourceRecord.id });

  const [biz] = await db
    .insert(business)
    .values({
      canonicalName: `Review Subject ${token}`,
      nameKey: `review${token}`,
      region: 'Porto',
      canonicalDomainState: 'unknown',
      canonicalDomainReason: 'not_searched',
    })
    .returning({ id: business.id });

  const [claim] = await db
    .insert(evidence)
    .values({
      businessId: biz!.id,
      sourceRecordId: record!.id,
      claimKey: 'observation',
      classification: 'objective_defect',
      confidence: 'high',
      excerpt: 'The checkout shows no delivery cost until the final step.',
    })
    .returning({ id: evidence.id });

  const [person] = await db
    .insert(contact)
    .values({
      businessId: biz!.id,
      channel: 'email',
      value: `hello@review-${token}.test`,
      valueHash: `vh-${token}`,
      verification: 'probable',
      sourceRecordId: record!.id,
    })
    .returning({ id: contact.id });

  const { opportunityId } = await upsertOpportunity(db as unknown as Database, ctx, {
    businessId: biz!.id,
    moduleId: 'fashion',
    score,
  });

  const [created] = await db
    .insert(campaign)
    .values({ workspaceId: ctx.workspaceId, name: `Campaign ${token}`, channel: 'email' })
    .returning({ id: campaign.id });

  const [drafted] = await db
    .insert(message)
    .values({
      workspaceId: ctx.workspaceId,
      campaignId: created!.id,
      opportunityId,
      contactId: person!.id,
      subject: 'Quick note about your website',
      body,
      bodyHash: hashValue(body),
      groundingEvidenceIds: [claim!.id],
    })
    .returning({ id: message.id });

  if (options.approveIt) {
    await db.insert(approval).values({
      workspaceId: ctx.workspaceId,
      messageId: drafted!.id,
      approvedBodyHash: hashValue(body),
    });
  }

  return { campaignId: created!.id, messageId: drafted!.id, opportunityId };
}

describe('what the reviewer is shown', () => {
  it('returns the exact body, not a preview of it', async () => {
    const body = 'A message with\n\nmore than one paragraph and a trailing detail.';
    const { campaignId } = await aMessage(body);

    const review = await loadCampaignReview(db as unknown as Database, ctx, campaignId);

    expect(review?.rows).toHaveLength(1);
    expect(review!.rows[0]!.body).toBe(body);
    expect(review!.rows[0]!.recipient).toMatch(/^hello@review-/);
    expect(review!.rows[0]!.groundingCount).toBe(1);
  });

  it('reports an unapproved message as unapproved and not as stale', async () => {
    const { campaignId } = await aMessage('Unapproved text.');
    const review = await loadCampaignReview(db as unknown as Database, ctx, campaignId);

    expect(review!.rows[0]!.approvedForThisVersion).toBe(false);
    expect(review!.rows[0]!.staleApproval).toBe(false);
  });

  it('reports an approved, untouched message as approved', async () => {
    const { campaignId } = await aMessage('Approved text.', { approveIt: true });
    const review = await loadCampaignReview(db as unknown as Database, ctx, campaignId);

    expect(review!.rows[0]!.approvedForThisVersion).toBe(true);
    expect(review!.rows[0]!.staleApproval).toBe(false);
  });

  it('withdraws approval arithmetically when the body changes', async () => {
    const { campaignId, messageId } = await aMessage('The approved text.', { approveIt: true });

    const changed = 'Completely different text the user never approved.';
    await db
      .update(message)
      .set({ body: changed, bodyHash: hashValue(changed), version: 2 })
      .where(eq(message.id, messageId));

    const review = await loadCampaignReview(db as unknown as Database, ctx, campaignId);

    expect(review!.rows[0]!.approvedForThisVersion).toBe(false);
    // Distinguished from never-approved, because the user did approve
    // something and needs to be told their edit undid it.
    expect(review!.rows[0]!.staleApproval).toBe(true);
    expect(review!.rows[0]!.version).toBe(2);
  });

  it('does not return another workspace’s campaign', async () => {
    const { campaignId } = await aMessage('Private to this workspace.');
    const other = await seedWorkspace(db, { allowance: 5 });

    const review = await loadCampaignReview(
      db as unknown as Database,
      { workspaceId: other.workspaceId, userId: other.userId, role: 'owner' },
      campaignId,
    );

    // Undefined rather than an empty campaign: the response should not confirm
    // that a campaign with this id exists at all.
    expect(review).toBeUndefined();
  });
});
