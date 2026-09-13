/**
 * Development convenience: the job worker, in-process.
 *
 * `pnpm dev` is then all that is needed to run the whole product — the queue
 * drains without a second terminal. It is the same `createWorker` that
 * `scripts/worker.ts` runs in production, so there is no code path that exists
 * only in development.
 *
 * Deliberately NOT started when `KOVVI_EXTERNAL_WORKER=1`, which is what a
 * production deployment sets: two workers polling the same queue is safe (the
 * claim takes a lease under `FOR UPDATE SKIP LOCKED`) but it is not what anyone
 * intended, and on a serverless host the in-process one would be started and
 * frozen once per instance.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.KOVVI_EXTERNAL_WORKER === '1') return;
  // The build step imports this file; starting a poll loop against a database
  // that may not exist yet would fail the build for no benefit.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { createWorker } = await import('./server/queue/worker');

  const worker = createWorker({
    onOutcome: (outcome) => {
      console.log(`[worker] ${outcome.stage} ${outcome.jobId} → ${outcome.state}`);
    },
  });

  console.log(`[worker] ${worker.id} started in-process`);
}
