/**
 * The job worker, as its own process.
 *
 * This is what runs in production. In development the same `createWorker` is
 * started from `src/instrumentation.ts` so `pnpm dev` is enough — identical
 * code either way, so a bug cannot exist in only one of them.
 *
 *   pnpm worker
 */
import { config as loadEnv } from 'dotenv';
import { closeDb } from '../src/server/db/client.js';
import { createWorker } from '../src/server/queue/worker.js';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const worker = createWorker({
  onOutcome: (outcome) => {
    // Inconclusive is logged like a result, not like a failure, because that is
    // what it is. A log that shouts about blocked crawls trains whoever reads
    // it to treat the product's most important honest answer as an incident.
    console.log(
      `[worker] ${outcome.stage} ${outcome.jobId} → ${outcome.state}` +
        (outcome.detail ? ` (${outcome.detail})` : ''),
    );
  },
});

console.log(`[worker] ${worker.id} started`);

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;

  // Stop claiming, let in-flight jobs finish, then release the pool. Exiting
  // mid-job would leave a lease to expire, which works but costs the reaper's
  // interval before anyone else can pick the work up.
  console.log(`[worker] ${signal} — finishing in-flight jobs`);
  await worker.stop();
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
