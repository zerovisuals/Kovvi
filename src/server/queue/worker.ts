import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client';
import { getDb } from '../db/client';
import { claimJobs, reapExpiredLeases, DEFAULT_CONCURRENCY, STAGE_CONCURRENCY } from './queue';
import { runJob, type RunOutcome } from './runner';
import type { StageId } from '../pipeline/stage';
import { registeredStages } from '../pipeline/registry';

/**
 * The worker loop.
 *
 * Runs in-process during development (started from `instrumentation.ts`, so
 * `pnpm dev` is all you need) and as its own process in production via
 * `pnpm worker`. Identical code either way, so a bug cannot exist in only one
 * of them.
 *
 * Concurrency is per stage rather than global: browser inspections are heavy
 * and a handful of them will exhaust a small machine, while everything else is
 * IO-bound and can run wider.
 */

export type WorkerOptions = {
  readonly db?: Database;
  readonly workerId?: string;
  readonly pollMs?: number;
  readonly reapEveryMs?: number;
  readonly stages?: readonly StageId[];
  readonly onOutcome?: (outcome: RunOutcome) => void;
  /** Start the polling loop immediately. Tests drive `tick()` by hand instead. */
  readonly autoStart?: boolean;
};

export type Worker = {
  readonly id: string;
  stop(): Promise<void>;
  /** Runs one cycle and returns what it did. Used by tests. */
  tick(): Promise<RunOutcome[]>;
};

export function createWorker(options: WorkerOptions = {}): Worker {
  const db = options.db ?? getDb();
  const id = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const pollMs = options.pollMs ?? 500;
  const reapEveryMs = options.reapEveryMs ?? 30_000;
  const stages = options.stages ?? registeredStages();

  let running = true;
  let loop: Promise<void> | null = null;
  let lastReap = 0;

  /** Jobs currently executing, per stage, so limits are actually enforced. */
  const inFlight = new Map<StageId, number>();

  function capacityFor(stage: StageId): number {
    const limit = STAGE_CONCURRENCY[stage] ?? DEFAULT_CONCURRENCY;
    return limit - (inFlight.get(stage) ?? 0);
  }

  async function tick(): Promise<RunOutcome[]> {
    const outcomes: RunOutcome[] = [];

    if (Date.now() - lastReap > reapEveryMs) {
      lastReap = Date.now();
      // A worker that died mid-job leaves a lease behind; this puts the job
      // back rather than stranding it until someone notices.
      await reapExpiredLeases(db).catch(() => 0);
    }

    for (const stage of stages) {
      const capacity = capacityFor(stage);
      if (capacity <= 0) continue;

      const claimed = await claimJobs(db, id, capacity, [stage]);

      const pending = claimed.map(async (claimedJob) => {
        inFlight.set(stage, (inFlight.get(stage) ?? 0) + 1);
        try {
          const outcome = await runJob(db, claimedJob, id);
          outcomes.push(outcome);
          options.onOutcome?.(outcome);
        } finally {
          inFlight.set(stage, Math.max(0, (inFlight.get(stage) ?? 1) - 1));
        }
      });

      await Promise.all(pending);
    }

    return outcomes;
  }

  async function start(): Promise<void> {
    while (running) {
      try {
        const outcomes = await tick();
        // Back off only when idle, so a busy queue drains without artificial
        // delay between jobs.
        if (outcomes.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, pollMs));
        }
      } catch (error) {
        console.error('[worker] cycle failed', error);
        await new Promise((resolve) => setTimeout(resolve, pollMs * 4));
      }
    }
  }

  if (options.autoStart ?? true) {
    loop = start();
  }

  return {
    id,
    tick,
    async stop() {
      running = false;
      if (loop) await loop;
    },
  };
}
