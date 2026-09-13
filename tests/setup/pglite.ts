import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/server/db/schema';

/**
 * A fresh, empty database per test file.
 *
 * Tests talk to PGlite IN PROCESS rather than through the wire-protocol server
 * the app uses. That is a deliberate difference and the only place the two
 * diverge: an in-memory instance costs nothing to create, needs no ports, and
 * gives each test file genuine isolation instead of a shared database that has
 * to be cleaned between runs.
 *
 * The SQL is identical either way — the same generated migrations are applied —
 * so behaviour under test matches behaviour in production. What is NOT tested
 * here is the wire protocol itself, which `pnpm db:migrate` exercises on every
 * schema change.
 */

export type TestDb = PgliteDatabase<typeof schema> & { $client: PGlite };

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db as TestDb;
}

export async function closeTestDb(db: TestDb): Promise<void> {
  await db.$client.close();
}
