import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { job as jobTable, providerCall, researchRun } from '../db/schema';
import {
  backoffMs,
  PermanentError,
  RetryableError,
  type AnyStage,
  type StageContext,
  type StageId,
  type StageResult,
} from '../pipeline/stage';
import { CapabilityAbsentError, capabilityState } from '../capabilities/registry';
import { finalise, refund } from '../billing/usage';
import { LEASE_MS, enqueueNext, renewLease, type ClaimedJob } from './queue';
import { getStage, stageCost } from '../pipeline/registry';

/**
 * Executes one claimed job.
 *
 * The terminal-state mapping is the whole point, and it follows directly from
 * the stage contract:
 *
 *   ok            → succeeded,    finalise the cost
 *   inconclusive  → inconclusive, finalise the cost   ← a SUCCESS
 *   retry         → back to queued with backoff, cost untouched
 *   failed        → failed or dead, REFUND the cost
 *
 * `inconclusive` finalising rather than refunding is deliberate: a site that
 * blocked us cost exactly as much to attempt as one that did not, and free
 * blocked inspections would be an easy way to run up someone else's bill.
 */

export type RunOutcome = {
  readonly jobId: string;
  readonly stage: StageId;
  readonly state: 'succeeded' | 'inconclusive' | 'failed' | 'dead' | 'requeued';
  readonly detail?: string;
};

export async function runJob(db: Database, claimed: ClaimedJob, workerId: string): Promise<RunOutcome> {
  const stage = getStage(claimed.stage);

  await db
    .update(jobTable)
    .set({ state: 'running', updatedAt: new Date() })
    .where(eq(jobTable.id, claimed.id));

  // Abort the stage slightly before the lease expires, so it stops on our terms
  // rather than being reaped mid-write.
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), Math.min(stage.timeoutMs, LEASE_MS - 10_000));

  // Long stages (a full site inspection) outlive a single lease otherwise.
  const renewTimer = setInterval(() => {
    void renewLease(db, claimed.id).catch(() => {});
  }, LEASE_MS / 3);

  const ctx: StageContext = {
    db,
    workspaceId: claimed.workspaceId,
    runId: claimed.runId,
    jobId: claimed.id,
    attempt: claimed.attempt,
    signal: controller.signal,
    async recordProviderCall(call) {
      await db.insert(providerCall).values({
        jobId: claimed.id,
        provider: call.provider,
        capabilityId: call.capabilityId,
        httpStatus: call.httpStatus ?? null,
        latencyMs: call.latencyMs ?? null,
        costUnits: call.costUnits ?? 0,
        error: call.error ?? null,
      });
    },
  };

  let result: StageResult<unknown>;

  try {
    /* A stage whose capability is absent NEVER RUNS. Short-circuiting here
       rather than inside the stage is what makes it impossible for an
       unconfigured integration to produce output — there is no code path from
       "not connected" to "here are some results". */
    if (stage.capability) {
      const status = capabilityState(stage.capability);
      if (status.state !== 'live') {
        result = {
          kind: 'inconclusive',
          reason: 'source_unavailable',
          detail:
            status.state === 'absent'
              ? `${stage.capability} is not connected (missing ${status.missing.join(', ')}).`
              : `${stage.capability} is unavailable: ${status.detail}`,
        };
        return await settle(db, claimed, stage, result, workerId);
      }
    }

    const parsedInput = stage.input.parse(claimed.input);
    result = await stage.run(parsedInput, ctx);

    if (result.kind === 'ok') {
      // Validate on the way out too: a stage that returns a shape its own
      // schema rejects is a bug we want to see here, not three stages later.
      stage.output.parse(result.output);
    }
  } catch (error) {
    if (error instanceof CapabilityAbsentError) {
      result = { kind: 'inconclusive', reason: 'source_unavailable', detail: error.message };
    } else if (error instanceof RetryableError) {
      result = { kind: 'retry', afterMs: error.afterMs ?? backoffMs(claimed.attempt), reason: error.message };
    } else if (error instanceof PermanentError) {
      result = { kind: 'failed', reason: error.message };
    } else if (controller.signal.aborted) {
      result = { kind: 'inconclusive', reason: 'timeout', detail: `Stage exceeded ${stage.timeoutMs}ms.` };
    } else {
      result = { kind: 'failed', reason: error instanceof Error ? error.message : 'stage threw' };
    }
  } finally {
    clearTimeout(abortTimer);
    clearInterval(renewTimer);
  }

  return settle(db, claimed, stage, result, workerId);
}

async function settle(
  db: Database,
  claimed: ClaimedJob,
  stage: AnyStage,
  result: StageResult<unknown>,
  _workerId: string,
): Promise<RunOutcome> {
  const base = { jobId: claimed.id, stage: claimed.stage } as const;

  if (result.kind === 'retry') {
    const nextAttempt = claimed.attempt + 1;

    if (nextAttempt >= claimed.maxAttempts) {
      // Out of attempts. Treated as a failure, so the reservation is refunded.
      await db.transaction(async (tx) => {
        await tx
          .update(jobTable)
          .set({
            state: 'dead',
            attempt: nextAttempt,
            lastError: `Gave up after ${nextAttempt} attempts: ${result.reason}`,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(jobTable.id, claimed.id));

        await refundIfCharged(tx as unknown as Database, claimed);
      });

      return { ...base, state: 'dead', detail: result.reason };
    }

    await db
      .update(jobTable)
      .set({
        state: 'queued',
        attempt: nextAttempt,
        claimedBy: null,
        claimedAt: null,
        leaseUntil: null,
        scheduledAt: new Date(Date.now() + result.afterMs),
        lastError: result.reason,
        updatedAt: new Date(),
      })
      .where(eq(jobTable.id, claimed.id));

    return { ...base, state: 'requeued', detail: result.reason };
  }

  if (result.kind === 'failed') {
    await db.transaction(async (tx) => {
      await tx
        .update(jobTable)
        .set({
          state: 'failed',
          lastError: result.reason,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(jobTable.id, claimed.id));

      await refundIfCharged(tx as unknown as Database, claimed);
    });

    return { ...base, state: 'failed', detail: result.reason };
  }

  /* ok and inconclusive: both succeeded, both finalise. */
  const isInconclusive = result.kind === 'inconclusive';

  await db.transaction(async (tx) => {
    await tx
      .update(jobTable)
      .set({
        state: isInconclusive ? 'inconclusive' : 'succeeded',
        output: isInconclusive ? {} : ((result.output ?? {}) as Record<string, unknown>),
        inconclusiveReason: isInconclusive ? result.reason : null,
        inconclusiveDetail: isInconclusive ? result.detail : null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobTable.id, claimed.id));

    if (claimed.costUnits > 0) {
      await finalise(tx as unknown as Database, {
        workspaceId: claimed.workspaceId,
        unitType: stageCost(stage.id),
        units: claimed.costUnits,
        idempotencyKey: claimed.idempotencyKey,
        runId: claimed.runId,
        jobId: claimed.id,
        note: isInconclusive
          ? `Inconclusive (${result.reason}); the work was still performed.`
          : undefined,
      });

      if (claimed.runId) {
        await tx
          .update(researchRun)
          .set({
            unitsFinalised: sql`${researchRun.unitsFinalised} + ${claimed.costUnits}`,
            updatedAt: new Date(),
          })
          .where(eq(researchRun.id, claimed.runId));
      }
    }
  });

  if (result.next && result.next.length > 0) {
    await enqueueNext(
      db,
      {
        workspaceId: claimed.workspaceId,
        runId: claimed.runId,
        idempotencyKey: claimed.idempotencyKey,
      },
      result.next,
      (stageId, input) => getStage(stageId).cost(input),
    );
  }

  return {
    ...base,
    state: isInconclusive ? 'inconclusive' : 'succeeded',
    ...(isInconclusive ? { detail: result.detail } : {}),
  };
}

async function refundIfCharged(db: Database, claimed: ClaimedJob): Promise<void> {
  if (claimed.costUnits <= 0) return;

  await refund(db, {
    workspaceId: claimed.workspaceId,
    unitType: stageCost(claimed.stage),
    units: claimed.costUnits,
    idempotencyKey: claimed.idempotencyKey,
    runId: claimed.runId,
    jobId: claimed.id,
    note: 'Refunded: the job did not complete.',
  });

  if (claimed.runId) {
    await db
      .update(researchRun)
      .set({
        unitsRefunded: sql`${researchRun.unitsRefunded} + ${claimed.costUnits}`,
        updatedAt: new Date(),
      })
      .where(eq(researchRun.id, claimed.runId));
  }
}
