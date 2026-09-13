import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { seedWorkspace } from '../setup/factories';
import {
  approval,
  business,
  campaign,
  contact,
  conversationMessage,
  evidence,
  followUpSchedule,
  message,
  sourceRecord,
} from '@/server/db/schema';
import { upsertOpportunity } from '@/server/db/repo/opportunity';
import { scoreOpportunity } from '@/server/rank/score';
import {
  decideDispatch,
  isSuppressed,
  recordOptOut,
  recordReplyAndCancelFollowUps,
} from '@/server/email/dispatch';
import type { Database } from '@/server/db/client';
import type { TenantContext } from '@/server/db/tenant';

/**
 * ACCEPTANCE CASE 8 — "Reply or opt-out before follow-up: follow-up canceled."
 *
 * The most irritating thing a prospecting tool can do is follow up with someone
 * who already answered. It is also trivially avoidable, which is why it reads
 * as carelessness rather than as a bug — and it is the freelancer's name on the
 * message, not ours.
 *
 * Cancellation happens in the SAME transaction that records the reply. Split
 * across two statements, a crash between them leaves follow-ups armed.
 */

let db: TestDb;
let ctx: TenantContext;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

async function scenario(options: { followUps?: number } = {}) {
  const seeded = await seedWorkspace(db, { allowance: 20 });
  ctx = { workspaceId: seeded.workspaceId, userId: seeded.userId, role: 'owner' };

  const [record] = await db
    .insert(sourceRecord)
    .values({
      url: `https://example.test/${Math.random().toString(36).slice(2)}`,
      urlHash: Math.random().toString(36),
      contentHash: Math.random().toString(36),
      httpStatus: 200,
    })
    .returning({ id: sourceRecord.id });

  const [biz] = await db
    .insert(business)
    .values({
      canonicalName: 'Replier Ltd',
      nameKey: `replier${Math.random().toString(36).slice(2, 7)}`,
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
      excerpt: 'No contact route on the site.',
    })
    .returning({ id: evidence.id });

  const [person] = await db
    .insert(contact)
    .values({
      businessId: biz!.id,
      channel: 'email',
      value: 'owner@replier.test',
      valueHash: 'hash-owner',
      sourceRecordId: record!.id,
    })
    .returning({ id: contact.id });

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

  const { opportunityId } = await upsertOpportunity(db as unknown as Database, ctx, {
    businessId: biz!.id,
    moduleId: 'local_services',
    score,
  });

  const [created] = await db
    .insert(campaign)
    .values({ workspaceId: ctx.workspaceId, name: 'Test campaign', channel: 'email' })
    .returning({ id: campaign.id });

  const [drafted] = await db
    .insert(message)
    .values({
      workspaceId: ctx.workspaceId,
      campaignId: created!.id,
      opportunityId,
      contactId: person!.id,
      body: 'Hello — a quick note about your site.',
      bodyHash: 'body-hash-v1',
      groundingEvidenceIds: [claim!.id],
    })
    .returning({ id: message.id });

  await db.insert(approval).values({
    workspaceId: ctx.workspaceId,
    messageId: drafted!.id,
    approvedBodyHash: 'body-hash-v1',
  });

  for (let step = 1; step <= (options.followUps ?? 2); step += 1) {
    await db.insert(followUpSchedule).values({
      workspaceId: ctx.workspaceId,
      messageId: drafted!.id,
      stepNumber: step,
      scheduledAt: new Date(Date.now() + step * 3 * 86_400_000),
    });
  }

  return { opportunityId, messageId: drafted!.id, contactValue: 'owner@replier.test' };
}

describe('a reply arriving before the follow-up', () => {
  it('cancels every pending follow-up', async () => {
    const { opportunityId, messageId } = await scenario({ followUps: 3 });

    const before = await db
      .select()
      .from(followUpSchedule)
      .where(eq(followUpSchedule.messageId, messageId));
    expect(before).toHaveLength(3);
    expect(before.every((row) => row.cancelledAt === null)).toBe(true);

    const { cancelled } = await recordReplyAndCancelFollowUps(db as unknown as Database, {
      workspaceId: ctx.workspaceId,
      opportunityId,
      channel: 'email',
      body: 'Thanks — we are all set for now.',
    });

    expect(cancelled).toBe(3);

    const after = await db
      .select()
      .from(followUpSchedule)
      .where(eq(followUpSchedule.messageId, messageId));

    expect(after.every((row) => row.cancelledAt !== null)).toBe(true);
    expect(after[0]?.cancelReason).toMatch(/replied/i);
  });

  it('refuses to dispatch anything else to that opportunity', async () => {
    const { opportunityId, messageId } = await scenario();

    // Approved and ready before the reply arrives.
    const before = await decideDispatch(db as unknown as Database, messageId, {
      requireCapability: false,
    });
    expect(before.kind).toBe('send');

    await recordReplyAndCancelFollowUps(db as unknown as Database, {
      workspaceId: ctx.workspaceId,
      opportunityId,
      channel: 'email',
      body: 'Not right now, thanks.',
    });

    const after = await decideDispatch(db as unknown as Database, messageId, {
      requireCapability: false,
    });

    expect(after.kind).toBe('refuse');
    if (after.kind === 'refuse') {
      expect(after.reason).toBe('reply_received');
      expect(after.detail).toMatch(/already replied/i);
    }
  });

  it('does not guess what the reply meant', async () => {
    const { opportunityId } = await scenario();

    await recordReplyAndCancelFollowUps(db as unknown as Database, {
      workspaceId: ctx.workspaceId,
      opportunityId,
      channel: 'email',
      // Reads like interest. Is frequently not.
      body: 'This looks interesting, let me discuss internally and come back to you.',
    });

    const [logged] = await db
      .select()
      .from(conversationMessage);

    expect(logged?.intent).toBe('unclassified');
  });
});

describe('an opt-out', () => {
  it('cancels pending follow-ups and suppresses the address permanently', async () => {
    const { opportunityId, messageId, contactValue } = await scenario({ followUps: 2 });

    const { cancelled } = await recordOptOut(db as unknown as Database, {
      workspaceId: ctx.workspaceId,
      opportunityId,
      contactValue,
    });

    expect(cancelled).toBe(2);

    const after = await db
      .select()
      .from(followUpSchedule)
      .where(eq(followUpSchedule.messageId, messageId));
    expect(after.every((row) => row.cancelledAt !== null)).toBe(true);
    expect(after[0]?.cancelReason).toMatch(/opted out/i);

    expect(await isSuppressed(db as unknown as Database, ctx.workspaceId, contactValue)).toBe(true);
    // Case-insensitively, because addresses are written inconsistently.
    expect(
      await isSuppressed(db as unknown as Database, ctx.workspaceId, contactValue.toUpperCase()),
    ).toBe(true);
  });

  it('does not suppress an unrelated address', async () => {
    const { opportunityId, contactValue } = await scenario();
    await recordOptOut(db as unknown as Database, {
      workspaceId: ctx.workspaceId,
      opportunityId,
      contactValue,
    });

    expect(
      await isSuppressed(db as unknown as Database, ctx.workspaceId, 'someone.else@other.test'),
    ).toBe(false);
  });
});

describe('editing after approval', () => {
  it('invalidates the approval rather than sending the new text', async () => {
    const { messageId } = await scenario();

    await db
      .update(message)
      .set({ body: 'Completely different text.', bodyHash: 'body-hash-v2' })
      .where(eq(message.id, messageId));

    const decision = await decideDispatch(db as unknown as Database, messageId, {
      requireCapability: false,
    });

    expect(decision.kind).toBe('refuse');
    if (decision.kind === 'refuse') {
      expect(decision.reason).toBe('edited_after_approval');
      expect(decision.detail).toMatch(/approve the new version/i);
    }
  });
});
