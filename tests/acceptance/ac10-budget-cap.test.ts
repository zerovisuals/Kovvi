import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { seedRun, seedWorkspace } from '../setup/factories';
import { job, researchRun } from '@/server/db/schema';
import { enqueue } from '@/server/queue/queue';
import { balanceFor } from '@/server/billing/usage';
import type { Database } from '@/server/db/client';

/**
 * ACCEPTANCE CASE 10 — "Budget exhausted mid-run: retain partial results and
 * stop cleanly."
 *
 * The failure this prevents is a run that spends its ceiling and then throws
 * away what it bought. The user paid for those assessments; they must survive.
 *
 * Reserving BEFORE the work — rather than charging after it — is what makes
 * this possible: the run discovers it is out of budget while it still has the
 * budget, so it can stop deliberately instead of discovering the overspend
 * afterwards.
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
  const seeded = await seedWorkspace(db, { allowance: 100 });
  workspaceId = seeded.workspaceId;
});

describe('a run that reaches its ceiling', () => {
  it('queues up to the cap and cancels the rest', async () => {
    const runId = await seedRun(db, workspaceId, { unitCap: 3 });

    const outcomes = [];
    for (let candidate = 0; candidate < 10; candidate += 1) {
      outcomes.push(
        await enqueue(db as unknown as Database, {
          workspaceId,
          runId,
          stage: 'inspect_site',
          input: { url: `https://candidate-${candidate}.test/` },
          idempotencyKey: `${runId}:inspect:${candidate}`,
          cost: { unitType: 'deep_assessment', units: 1 },
        }),
      );
    }

    expect(outcomes.filter((o) => o.kind === 'queued')).toHaveLength(3);
    expect(outcomes.filter((o) => o.kind === 'cancelled_budget')).toHaveLength(7);
  });

  it('KEEPS the work already queued — nothing is discarded', async () => {
    const runId = await seedRun(db, workspaceId, { unitCap: 3 });

    for (let candidate = 0; candidate < 10; candidate += 1) {
      await enqueue(db as unknown as Database, {
        workspaceId,
        runId,
        stage: 'inspect_site',
        input: { url: `https://candidate-${candidate}.test/` },
        idempotencyKey: `${runId}:inspect:${candidate}`,
        cost: { unitType: 'deep_assessment', units: 1 },
      });
    }

    const queued = await db
      .select()
      .from(job)
      .where(and(eq(job.runId, runId), eq(job.state, 'queued')));

    // The three the user paid for are intact and will run.
    expect(queued).toHaveLength(3);
  });

  it('marks the run capped, so the UI can say so honestly', async () => {
    const runId = await seedRun(db, workspaceId, { unitCap: 2 });

    for (let candidate = 0; candidate < 5; candidate += 1) {
      await enqueue(db as unknown as Database, {
        workspaceId,
        runId,
        stage: 'inspect_site',
        input: { url: `https://candidate-${candidate}.test/` },
        idempotencyKey: `${runId}:inspect:${candidate}`,
        cost: { unitType: 'deep_assessment', units: 1 },
      });
    }

    const [run] = await db.select().from(researchRun).where(eq(researchRun.id, runId));
    expect(run?.status).toBe('capped');
    expect(run?.unitsReserved).toBe(2);
  });

  it('records WHY each cancelled job was cancelled', async () => {
    const runId = await seedRun(db, workspaceId, { unitCap: 1 });

    for (let candidate = 0; candidate < 3; candidate += 1) {
      await enqueue(db as unknown as Database, {
        workspaceId,
        runId,
        stage: 'inspect_site',
        input: { url: `https://candidate-${candidate}.test/` },
        idempotencyKey: `${runId}:inspect:${candidate}`,
        cost: { unitType: 'deep_assessment', units: 1 },
      });
    }

    const cancelled = await db
      .select()
      .from(job)
      .where(and(eq(job.runId, runId), eq(job.state, 'cancelled_budget')));

    expect(cancelled).toHaveLength(2);
    for (const row of cancelled) {
      // A cancelled job the user cannot explain is indistinguishable from a
      // bug, so the reason is stored rather than inferred.
      expect(row.lastError).toMatch(/cap/i);
    }
  });

  it('never charges for work it cancelled', async () => {
    const runId = await seedRun(db, workspaceId, { unitCap: 3 });
    const before = await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment');

    for (let candidate = 0; candidate < 20; candidate += 1) {
      await enqueue(db as unknown as Database, {
        workspaceId,
        runId,
        stage: 'inspect_site',
        input: { url: `https://candidate-${candidate}.test/` },
        idempotencyKey: `${runId}:inspect:${candidate}`,
        cost: { unitType: 'deep_assessment', units: 1 },
      });
    }

    const after = await balanceFor(db as unknown as Database, workspaceId, 'deep_assessment');
    expect(before - after).toBe(3);
  });
});

describe('a workspace that runs out of allowance entirely', () => {
  it('stops cleanly rather than going negative', async () => {
    const poor = await seedWorkspace(db, { allowance: 2 });
    const runId = await seedRun(db, poor.workspaceId, { unitCap: 100 });

    const outcomes = [];
    for (let candidate = 0; candidate < 6; candidate += 1) {
      outcomes.push(
        await enqueue(db as unknown as Database, {
          workspaceId: poor.workspaceId,
          runId,
          stage: 'inspect_site',
          input: { url: `https://candidate-${candidate}.test/` },
          idempotencyKey: `${runId}:inspect:${candidate}`,
          cost: { unitType: 'deep_assessment', units: 1 },
        }),
      );
    }

    expect(outcomes.filter((o) => o.kind === 'queued')).toHaveLength(2);

    const balance = await balanceFor(
      db as unknown as Database,
      poor.workspaceId,
      'deep_assessment',
    );
    // A negative balance would mean we performed work nobody paid for.
    expect(balance).toBe(0);
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  it('explains the shortfall in the cancelled job', async () => {
    const poor = await seedWorkspace(db, { allowance: 1 });
    const runId = await seedRun(db, poor.workspaceId, { unitCap: 100 });

    for (let candidate = 0; candidate < 3; candidate += 1) {
      await enqueue(db as unknown as Database, {
        workspaceId: poor.workspaceId,
        runId,
        stage: 'inspect_site',
        input: { url: `https://candidate-${candidate}.test/` },
        idempotencyKey: `${runId}:inspect:${candidate}`,
        cost: { unitType: 'deep_assessment', units: 1 },
      });
    }

    const [cancelled] = await db
      .select()
      .from(job)
      .where(and(eq(job.runId, runId), eq(job.state, 'cancelled_budget')));

    expect(cancelled?.lastError).toMatch(/allowance exhausted/i);
  });
});
