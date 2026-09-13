import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { job, researchRun } from '../db/schema';
import type { EnqueueSpec, StageId } from '../pipeline/stage';
import { reserve } from '../billing/usage';
import type { UnitType } from '../pipeline/stage';

/**
 * THE JOB QUEUE
 *
 * The database is the queue. There is no Redis, no BullMQ, no external broker.
 *
 * That is not a compromise. Every job already needs a durable row — for
 * progress reporting, for cost attribution, for the audit trail — so a separate
 * broker would mean writing that row anyway and then keeping two systems in
 * agreement about it. `FOR UPDATE SKIP LOCKED` gives correct concurrent claims
 * in about thirty lines, and the whole thing participates in the same
 * transactions as the billing ledger, which is what makes reserve-and-enqueue
 * atomic.
 */

export const LEASE_MS = 120_000;

/** Chromium is heavy; everything else is IO-bound. */
export const STAGE_CONCURRENCY: Partial<Record<StageId, number>> = {
  inspect_site: 2,
};
export const DEFAULT_CONCURRENCY = 4;

export type EnqueueOptions = {
  readonly workspaceId: string;
  readonly runId?: string | null;
  readonly stage: StageId;
  readonly input: Record<string, unknown>;
  /** Must be stable for the same logical work; the column is UNIQUE. */
  readonly idempotencyKey: string;
  readonly cost?: { readonly unitType: UnitType; readonly units: number } | null;
  readonly maxAttempts?: number;
  readonly delayMs?: number;
};

export type EnqueueOutcome =
  | { readonly kind: 'queued'; readonly jobId: string }
  /** The same key was already enqueued; nothing to do. */
  | { readonly kind: 'duplicate' }
  /** Allowance or run cap exhausted. Recorded, not silently dropped. */
  | { readonly kind: 'cancelled_budget'; readonly jobId: string; readonly detail: string };

/**
 * Enqueues a job, reserving its cost first.
 *
 * Reservation and insertion happen in ONE transaction. Split apart, a crash
 * between them would either charge for work that never ran or run work nobody
 * paid for — and at the volumes this product operates at, "rare" means "weekly".
 */
export async function enqueue(db: Database, options: EnqueueOptions): Promise<EnqueueOutcome> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: job.id })
      .from(job)
      .where(eq(job.idempotencyKey, options.idempotencyKey))
      .limit(1);

    if (existing.length > 0) return { kind: 'duplicate' } as const;

    let costUnits = 0;

    if (options.cost && options.cost.units > 0) {
      /* The run's own ceiling, checked before the workspace balance: the user
         set this limit for this run specifically, and exceeding it is a
         different situation from running out of allowance entirely. */
      if (options.runId) {
        const [run] = await tx
          .select({ cap: researchRun.unitCap, reserved: researchRun.unitsReserved })
          .from(researchRun)
          .where(eq(researchRun.id, options.runId))
          .limit(1);

        if (run && run.reserved + options.cost.units > run.cap) {
          const [cancelled] = await tx
            .insert(job)
            .values({
              runId: options.runId,
              workspaceId: options.workspaceId,
              stage: options.stage,
              state: 'cancelled_budget',
              input: options.input,
              idempotencyKey: options.idempotencyKey,
              costUnits: options.cost.units,
              maxAttempts: options.maxAttempts ?? 3,
              lastError: `Run cap of ${run.cap} reached.`,
            })
            .returning({ id: job.id });

          await tx
            .update(researchRun)
            .set({ status: 'capped', updatedAt: new Date() })
            .where(eq(researchRun.id, options.runId));

          return {
            kind: 'cancelled_budget',
            jobId: cancelled?.id ?? '',
            detail: `Run cap of ${run.cap} units reached.`,
          } as const;
        }
      }

      const reservation = await reserve(tx as unknown as Database, {
        workspaceId: options.workspaceId,
        unitType: options.cost.unitType,
        units: options.cost.units,
        idempotencyKey: options.idempotencyKey,
        runId: options.runId ?? null,
        note: `Reserved for ${options.stage}`,
      });

      if (reservation.kind === 'insufficient') {
        const [cancelled] = await tx
          .insert(job)
          .values({
            runId: options.runId ?? null,
            workspaceId: options.workspaceId,
            stage: options.stage,
            state: 'cancelled_budget',
            input: options.input,
            idempotencyKey: options.idempotencyKey,
            costUnits: options.cost.units,
            maxAttempts: options.maxAttempts ?? 3,
            lastError: `Allowance exhausted (${reservation.balance} left, ${reservation.needed} needed).`,
          })
          .returning({ id: job.id });

        return {
          kind: 'cancelled_budget',
          jobId: cancelled?.id ?? '',
          detail: `Allowance exhausted: ${reservation.balance} remaining, ${reservation.needed} needed.`,
        } as const;
      }

      costUnits = options.cost.units;

      if (options.runId) {
        await tx
          .update(researchRun)
          .set({
            unitsReserved: sql`${researchRun.unitsReserved} + ${costUnits}`,
            updatedAt: new Date(),
          })
          .where(eq(researchRun.id, options.runId));
      }
    }

    const [created] = await tx
      .insert(job)
      .values({
        runId: options.runId ?? null,
        workspaceId: options.workspaceId,
        stage: options.stage,
        state: 'queued',
        input: options.input,
        idempotencyKey: options.idempotencyKey,
        costUnits,
        maxAttempts: options.maxAttempts ?? 3,
        scheduledAt: options.delayMs ? new Date(Date.now() + options.delayMs) : new Date(),
      })
      .returning({ id: job.id });

    return { kind: 'queued', jobId: created?.id ?? '' } as const;
  });
}

export type ClaimedJob = typeof job.$inferSelect;

/**
 * Claims up to `limit` jobs for this worker.
 *
 * `SKIP LOCKED` is what makes several workers safe: each skips rows another is
 * already claiming rather than blocking on them. The lease means a worker that
 * dies mid-job does not strand it — `reapExpiredLeases` puts it back.
 */
export async function claimJobs(
  db: Database,
  workerId: string,
  limit: number,
  stages?: readonly StageId[],
): Promise<ClaimedJob[]> {
  const leaseUntil = new Date(Date.now() + LEASE_MS);
  const stageFilter = stages?.length
    ? sql`and stage in (${sql.join(stages.map((s) => sql`${s}`), sql`, `)})`
    : sql``;

  /**
   * The claim itself has to be raw SQL: `FOR UPDATE SKIP LOCKED` inside a
   * subquery is not expressible through the query builder, and it is the whole
   * mechanism that makes concurrent workers safe.
   *
   * It returns only ids, deliberately. `RETURNING *` hands back raw snake_case
   * columns, and reading `costUnits` or `idempotencyKey` off such a row yields
   * `undefined` — which then flows into the billing ledger as NaN. The second,
   * typed query costs one round trip and removes an entire class of silent
   * column-name bugs.
   */
  const claimed = await db.execute<{ id: string }>(sql`
    update "job" set
      state = 'claimed',
      claimed_by = ${workerId},
      claimed_at = now(),
      lease_until = ${leaseUntil},
      updated_at = now()
    where id in (
      select id from "job"
      where state = 'queued' and scheduled_at <= now()
      ${stageFilter}
      order by scheduled_at asc
      for update skip locked
      limit ${limit}
    )
    returning id
  `);

  const ids = [...claimed.rows].map((row) => row.id);
  if (ids.length === 0) return [];

  return db.select().from(job).where(inArray(job.id, ids));
}

/**
 * Returns jobs whose lease expired to the queue.
 *
 * `attempt` increments, so a job that reliably kills its worker eventually
 * exhausts its attempts and stops rather than crash-looping forever.
 */
export async function reapExpiredLeases(db: Database): Promise<number> {
  const result = await db
    .update(job)
    .set({
      state: 'queued',
      claimedBy: null,
      claimedAt: null,
      leaseUntil: null,
      attempt: sql`${job.attempt} + 1`,
      lastError: 'Lease expired; the worker stopped without finishing.',
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(job.state, ['claimed', 'running']),
        lt(job.leaseUntil, new Date()),
      ),
    )
    .returning({ id: job.id });

  return result.length;
}

/** Extends a lease for a long-running job, so the reaper does not steal it. */
export async function renewLease(db: Database, jobId: string): Promise<void> {
  await db
    .update(job)
    .set({ leaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() })
    .where(eq(job.id, jobId));
}

/** Enqueues the jobs a completed stage asked for. */
export async function enqueueNext(
  db: Database,
  parent: { workspaceId: string; runId: string | null; idempotencyKey: string },
  specs: readonly EnqueueSpec[],
  costFor: (stage: StageId, input: Record<string, unknown>) => EnqueueOptions['cost'],
): Promise<EnqueueOutcome[]> {
  const outcomes: EnqueueOutcome[] = [];

  for (const spec of specs) {
    outcomes.push(
      await enqueue(db, {
        workspaceId: parent.workspaceId,
        runId: parent.runId,
        stage: spec.stage,
        input: spec.input,
        // Derived from the parent's key, so a replayed parent produces the same
        // child keys and the duplicates collapse.
        idempotencyKey: `${parent.idempotencyKey}>${spec.stage}:${spec.idempotencySuffix}`,
        cost: costFor(spec.stage, spec.input),
        ...(spec.delayMs !== undefined ? { delayMs: spec.delayMs } : {}),
      }),
    );
  }

  return outcomes;
}
