/**
 * Local Postgres for development, with no Postgres install and no Docker.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * PGlite is an embedded Postgres compiled to WASM. The obvious move would be
 * to import it directly into the app, but that costs three things:
 *
 *   1. Its documentation covers client-side bundling only; Node server usage
 *      under Turbopack and `serverExternalPackages` is outside its scope.
 *   2. It is single-writer on a data directory, so the Next dev server and a
 *      background worker could not share one.
 *   3. Development would run a different driver from production, so DDL and
 *      query behaviour could diverge exactly where it matters least visibly.
 *
 * Instead PGlite runs here, in its own process, speaking the real Postgres
 * wire protocol. The application then uses plain `node-postgres` against
 * DATABASE_URL in EVERY environment — this in development, Neon or similar in
 * production. Same driver, same migrations, no WASM anywhere in the build.
 *
 *   pnpm db:server        # leave running in a second terminal
 *
 * Data persists in `.data/pg`. Delete that directory to start clean.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const DATA_DIR = resolve(process.cwd(), process.env.KOVVI_PG_DATA_DIR ?? '.data/pg');
const PORT = Number(process.env.KOVVI_PG_PORT ?? 5433);
const HOST = process.env.KOVVI_PG_HOST ?? '127.0.0.1';

await mkdir(DATA_DIR, { recursive: true });

console.log(`[db] opening PGlite at ${DATA_DIR}`);
const db = await PGlite.create({ dataDir: DATA_DIR });

const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: HOST,
  // The default is 1, which would deadlock the moment the app's connection
  // pool, the job worker and a drizzle-kit command all want a connection.
  // PGlite still executes one query at a time; this only allows the
  // connections to coexist.
  maxConnections: 32,
});

await server.start();

console.log(`[db] listening on ${HOST}:${PORT}`);
console.log(`[db] DATABASE_URL="postgres://postgres:postgres@${HOST}:${PORT}/postgres"`);
console.log('[db] ready — leave this running');

async function shutdown(signal: string) {
  console.log(`\n[db] ${signal} — closing`);
  try {
    await server.stop();
    await db.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
