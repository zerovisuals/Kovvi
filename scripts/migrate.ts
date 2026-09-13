/**
 * Applies pending migrations.
 *
 * Uses the same `node-postgres` driver as the application, against whatever
 * `DATABASE_URL` names — the local PGlite server in development, a hosted
 * Postgres in production. There is no separate development path, so a
 * migration that works here is the one that runs in production.
 */
import { config as loadEnv } from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb } from '../src/server/db/client.js';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const started = Date.now();

try {
  console.log('[migrate] applying migrations from ./drizzle');
  await migrate(getDb(), { migrationsFolder: './drizzle' });
  console.log(`[migrate] up to date in ${Date.now() - started}ms`);
} catch (error) {
  console.error('[migrate] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
