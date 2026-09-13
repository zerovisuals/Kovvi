import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { seedWorkspace } from '../setup/factories';
import { job, usageLedger } from '@/server/db/schema';
import { enqueue } from '@/server/queue/queue';
import { balanceFor, finalise, refund, reserve } from '@/server/billing/usage';
import type { Database } from '@/server/db/client';

/**
 * ACCEPTANCE CASE 7 — "Timeout/retry/webhook replay: no duplicate charge or
 * send."
 *
 * Distributed systems deliver things more than once. A retry fires while the
 * original is still running; a provider replays a webhook; a user double-clicks.
 * The question is not whether duplicates happen but what they cost.
 *
 * Kovvi's answer is a UNIQUE idempotency key on both the job and the ledger
 * entry, so a repeat is a no-op at the database level rather than something
 * application code has to remember to check. Being charged twice for research
 * you asked for once is the kind of thing that ends a subscription.
 */

let db: TestDb;
let workspaceId: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

beforeEach(async () => {
  const seeded = await seedWorkspace(db, { allowance: 50 });
  workspaceId = seeded.workspaceId;
});

describe('enqueueing the same work twice', () => {
  it('creates one job, not two', async () => {
    const key = `run-1:inspect:${workspaceId}`;
    const options = {
      workspaceId,
      stage: 'inspect_site' as const,
      input: { url: 'https://example.test/' },
      idempotencyKey: key,
      cost: { unitType: 'deep_assessment' as const, units: 1 },
    };

    const first = await enqueue(db as unknown as Database, options);
    const second = await enqueue(db as unknown as Database, options);
    const third = await enqueue(db as unknown as Database, options);

    expect(first.kind).toBe('queued');
    expect(second.kind).toBe('duplicate');
    expect(third.kind).toBe('duplicate');

    const jobs = await db.select().from(job).where(eq(job.workspaceId, workspaceId));
    expect(jobs).toHaveLength(1);
  });

  it('charges once, however many times it is delivered', async () => {
    const before = await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment');

    const options = {
      workspaceId,
      stage: 'inspect_site' as const,
      input: { url: 'https://example.test/' },
      idempotencyKey: 'replayed-delivery',
      cost: { unitType: 'deep_assessment' as const, units: 1 },
    };

    for (let delivery = 0; delivery < 5; delivery += 1) {
      await enqueue(db as unknown as Database, options);
    }

    const after = await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment');

    // Exactly one unit, despite five deliveries.
    expect(before - after).toBe(1);

    const reserves = await db
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.workspaceId, workspaceId));
    expect(reserves.filter((row) => row.kind === 'reserve')).toHaveLength(1);
  });
});

describe('the ledger itself', () => {
  it('ignores a replayed reserve', async () => {
    const entry = {
      workspaceId,
      unitType: 'deep_assessment' as const,
      units: 3,
      idempotencyKey: 'reserve-once',
    };

    const first = await reserve(db as unknown as Database, entry);
    const second = await reserve(db as unknown as Database, entry);

    expect(first.kind).toBe('reserved');
    expect(second.kind).toBe('already_reserved');
    expect(await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment')).toBe(47);
  });

  it('ignores a replayed finalise', async () => {
    const entry = {
      workspaceId,
      unitType: 'deep_assessment' as const,
      units: 2,
      idempotencyKey: 'finalise-once',
    };

    await reserve(db as unknown as Database, entry);
    expect(await finalise(db as unknown as Database, entry)).toBe(true);
    expect(await finalise(db as unknown as Database, entry)).toBe(false);

    // Finalise writes zero units; the debit happened at reserve time.
    expect(await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment')).toBe(48);
  });

  it('refunds exactly once, so a retried failure cannot mint allowance', async () => {
    const entry = {
      workspaceId,
      unitType: 'deep_assessment' as const,
      units: 4,
      idempotencyKey: 'refund-once',
    };

    await reserve(db as unknown as Database, entry);
    expect(await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment')).toBe(46);

    expect(await refund(db as unknown as Database, entry)).toBe(true);
    expect(await refund(db as unknown as Database, entry)).toBe(false);
    expect(await refund(db as unknown as Database, entry)).toBe(false);

    // Back to where we started — not above it.
    expect(await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment')).toBe(50);
  });

  it('keeps a full audit trail rather than a mutated counter', async () => {
    const entry = {
      workspaceId,
      unitType: 'deep_assessment' as const,
      units: 1,
      idempotencyKey: 'audit-trail',
    };

    await reserve(db as unknown as Database, entry);
    await finalise(db as unknown as Database, entry);

    const rows = await db
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.workspaceId, workspaceId));

    // Every movement is a row. A balance that is a sum can be explained; a
    // counter that was decremented cannot.
    const kinds = rows.map((row) => row.kind).sort();
    expect(kinds).toContain('grant');
    expect(kinds).toContain('reserve');
    expect(kinds).toContain('finalise');
  });
});
