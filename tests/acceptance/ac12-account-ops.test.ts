import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { seedWorkspace } from '../setup/factories';
import { auditEvent, business, opportunity, sourceRecord, workspace } from '@/server/db/schema';
import {
  cancelSubscription,
  deleteWorkspace,
  exportOpportunitiesCsv,
} from '@/server/account/operations';
import { upsertOpportunity } from '@/server/db/repo/opportunity';
import { scoreOpportunity } from '@/server/rank/score';
import { escapeCell, toCsv } from '@/lib/export/csv';
import type { Database } from '@/server/db/client';
import type { TenantContext } from '@/server/db/tenant';

/**
 * ACCEPTANCE CASE 12 — "Export/delete/cancel: verified end-to-end account
 * operation."
 *
 * Export and delete pass fully. Cancel passes as an HONEST ABSENCE: with no
 * payment provider configured there is no subscription to cancel, and the
 * product says exactly that. A stubbed "cancelled" would be the precise
 * dishonesty the brief forbids, so the assertion here is that it refuses to
 * claim it.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

const score = scoreOpportunity({
  matchedClaims: [],
  industryMatches: true,
  regionMatches: true,
  evidenceCount: 1,
  objectiveDefects: 0,
  inconclusive: false,
  latestEvent: null,
  hasVerifiedContact: false,
  hasAnyContact: false,
  identityConfirmed: true,
});

async function workspaceWithData(name: string): Promise<TenantContext> {
  const seeded = await seedWorkspace(db, { allowance: 10, name });
  const ctx: TenantContext = {
    workspaceId: seeded.workspaceId,
    userId: seeded.userId,
    role: 'owner',
  };

  for (const businessName of ['Alpha Ltd', 'Beta Ltd', '=cmd|calc']) {
    const [row] = await db
      .insert(business)
      .values({
        canonicalName: `${businessName} ${Math.random().toString(36).slice(2, 6)}`,
        nameKey: Math.random().toString(36).slice(2),
        region: 'Bristol',
        canonicalDomainState: 'unknown',
        canonicalDomainReason: 'not_searched',
      })
      .returning({ id: business.id });

    await upsertOpportunity(db as unknown as Database, ctx, {
      businessId: row!.id,
      moduleId: 'local_services',
      score,
    });
  }

  return ctx;
}

describe('export', () => {
  it('produces a CSV of the workspace’s own opportunities', async () => {
    const ctx = await workspaceWithData('Exporter');
    const csv = await exportOpportunitiesCsv(db as unknown as Database, ctx);

    expect(csv).toMatch(/organization,region,industry/);
    expect(csv).toMatch(/Alpha Ltd/);
    expect(csv).toMatch(/Bristol/);
    // RFC 4180 line endings, and a BOM so Excel reads UTF-8.
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
  });

  it('always carries data_origin, so sample rows stay identifiable', async () => {
    const ctx = await workspaceWithData('Origin');
    const csv = await exportOpportunitiesCsv(db as unknown as Database, ctx);

    expect(csv).toMatch(/data_origin/);
    expect(csv).toMatch(/real/);
  });

  it('neutralises formula injection', async () => {
    const ctx = await workspaceWithData('Injector');
    const csv = await exportOpportunitiesCsv(db as unknown as Database, ctx);

    // The business name began with `=`. In a spreadsheet that is a program, and
    // the values here were written by strangers.
    expect(csv).not.toMatch(/(^|,)=cmd/m);
    expect(csv).toMatch(/'=cmd/);
  });

  it('records the export in the audit log', async () => {
    const ctx = await workspaceWithData('Audited');
    await exportOpportunitiesCsv(db as unknown as Database, ctx);

    const events = await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.workspaceId, ctx.workspaceId));

    expect(events.map((row) => row.action)).toContain('data.exported');
  });
});

describe('CSV escaping', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['=HYPERLINK("http://evil.test","click")', `"'=HYPERLINK(""http://evil.test"",""click"")"`],
  ])('neutralises %s', (input, expected) => {
    expect(escapeCell(input)).toBe(expected);
  });

  it('quotes commas, quotes and newlines', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('strips control characters that hide content from a reader', () => {
    expect(escapeCell('visiblehidden')).toBe('visiblehidden');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeCell('Meridian Supply Co.')).toBe('Meridian Supply Co.');
    expect(toCsv([{ a: 'x' }], [{ header: 'a', value: (row) => row.a }])).toContain('a\r\nx');
  });
});

describe('delete', () => {
  it('removes the workspace and everything private to it', async () => {
    const ctx = await workspaceWithData('Departing');

    const before = await db
      .select()
      .from(opportunity)
      .where(eq(opportunity.workspaceId, ctx.workspaceId));
    expect(before.length).toBeGreaterThan(0);

    await deleteWorkspace(db as unknown as Database, ctx);

    const remaining = await db
      .select()
      .from(opportunity)
      .where(eq(opportunity.workspaceId, ctx.workspaceId));
    expect(remaining).toEqual([]);

    const workspaces = await db.select().from(workspace).where(eq(workspace.id, ctx.workspaceId));
    expect(workspaces).toEqual([]);
  });

  it('keeps SHARED public records, which contain nothing of this user’s', async () => {
    const ctx = await workspaceWithData('Considerate');

    const [record] = await db
      .insert(sourceRecord)
      .values({
        url: 'https://shared-fact.test/',
        urlHash: 'hash-shared-fact',
        contentHash: 'content-shared-fact',
        httpStatus: 200,
      })
      .returning({ id: sourceRecord.id });

    await deleteWorkspace(db as unknown as Database, ctx);

    // Deleting public facts about real businesses would degrade every other
    // user's research to no benefit to this one.
    const survivors = await db
      .select()
      .from(sourceRecord)
      .where(eq(sourceRecord.id, record!.id));
    expect(survivors).toHaveLength(1);
  });

  it('leaves an audit record that outlives the workspace', async () => {
    const ctx = await workspaceWithData('Auditable');
    await deleteWorkspace(db as unknown as Database, ctx);

    const events = await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.subjectId, ctx.workspaceId));

    const deletion = events.find((row) => row.action === 'workspace.deleted');
    expect(deletion).toBeDefined();
    // Null workspace, so the record survives the cascade — "your data was
    // deleted" is itself an auditable claim.
    expect(deletion?.workspaceId).toBeNull();
  });
});

describe('cancel', () => {
  it('refuses to claim a cancellation when billing is not connected', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const ctx = await workspaceWithData('Unbilled');
    const outcome = await cancelSubscription(db as unknown as Database, ctx);

    expect(outcome.kind).toBe('no_subscription');
    if (outcome.kind === 'no_subscription') {
      expect(outcome.detail).toMatch(/nothing is being charged/i);
      // And it points at what DOES still work.
      expect(outcome.detail).toMatch(/exportable and deletable/i);
    }
  });

  it('still allows export and delete with no subscription', async () => {
    const ctx = await workspaceWithData('Leaving');

    const csv = await exportOpportunitiesCsv(db as unknown as Database, ctx);
    expect(csv.length).toBeGreaterThan(0);

    await expect(deleteWorkspace(db as unknown as Database, ctx)).resolves.toMatchObject({
      workspaceId: ctx.workspaceId,
    });
  });
});
