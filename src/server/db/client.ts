import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema';

/**
 * The database connection. One driver, every environment.
 *
 * There is deliberately no driver switch here. PGlite runs as its own process
 * speaking the real Postgres wire protocol (`pnpm db:server`), so development
 * and production both use plain `node-postgres` against `DATABASE_URL`. That
 * removes a whole class of "works locally" bugs: identical driver, identical
 * SQL, identical migrations.
 *
 * Also note what is NOT imported: PGlite. It never enters the application
 * bundle, so there is no WASM for Turbopack to handle and no single-writer
 * contention between the web process and the job worker.
 */

export type Database = NodePgDatabase<typeof schema>;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. For local development run `pnpm db:server` in a ' +
        'second terminal and copy .env.example to .env.local. See docs/ARCHITECTURE.md.',
    );
  }
  return url;
}

function poolConfig(): PoolConfig {
  const url = connectionString();
  const isLocal = url.includes('127.0.0.1') || url.includes('localhost');

  return {
    connectionString: url,
    // The local PGlite server executes one query at a time regardless, so a
    // large pool buys nothing and risks exhausting its connection limit.
    max: isLocal ? 4 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Hosted Postgres almost always requires TLS; the local server has none.
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: true } }),
  };
}

/**
 * Cached on `globalThis` so Turbopack's hot reload does not open a new pool on
 * every edit and exhaust the server's connection limit within a few minutes.
 */
const globalForDb = globalThis as unknown as {
  __kovviPool?: Pool;
  __kovviDb?: Database;
};

export function getPool(): Pool {
  if (!globalForDb.__kovviPool) {
    const pool = new Pool(poolConfig());
    // An idle client erroring out must not take down the process; the pool
    // discards it and the next query gets a fresh connection.
    pool.on('error', (error) => {
      console.error('[db] idle client error', error);
    });
    globalForDb.__kovviPool = pool;
  }
  return globalForDb.__kovviPool;
}

export function getDb(): Database {
  if (!globalForDb.__kovviDb) {
    globalForDb.__kovviDb = drizzle(getPool(), { schema, casing: 'snake_case' });
  }
  return globalForDb.__kovviDb;
}

/** Closes the pool. For scripts and tests; the app holds it for its lifetime. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__kovviPool) {
    await globalForDb.__kovviPool.end();
    globalForDb.__kovviPool = undefined;
    globalForDb.__kovviDb = undefined;
  }
}

export { schema };
