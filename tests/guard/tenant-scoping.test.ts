import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/server/db/schema';
import {
  GLOBAL_TABLES,
  SHARED_OR_KEYED_TABLES,
  TENANT_TABLES,
} from '@/server/db/tenant';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';

/**
 * THE TENANT GUARD
 *
 * Kovvi holds one freelancer's prospect list, their messages, their prices and
 * their outcomes. A leak between workspaces is the worst thing this product
 * could do, so the classification of every table is checked mechanically rather
 * than remembered.
 *
 * The important assertion is the last one: a NEW table with a `workspace_id`
 * column that nobody classified fails the build. Forgetting to scope a table is
 * meant to be impossible to do quietly.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

/** Every Drizzle table in the schema, by SQL name. */
function schemaTables(): Map<string, PgTable> {
  const tables = new Map<string, PgTable>();
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) tables.set(getTableName(value), value);
  }
  return tables;
}

/** Column names of a table, read from the live database rather than the types. */
async function columnsOf(table: string): Promise<string[]> {
  const result = await db.$client.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_name = $1`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

describe('tenant scoping', () => {
  it('creates every schema table in the database', async () => {
    const expected = [...schemaTables().keys()].sort();
    const result = await db.$client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const actual = result.rows.map((r) => r.table_name);

    // `__drizzle_migrations` lives in its own schema, so public is ours alone.
    for (const table of expected) {
      expect(actual, `table ${table} is missing from the database`).toContain(table);
    }
  });

  it('every table classified as tenant-scoped has a NOT NULL workspace_id', async () => {
    for (const table of TENANT_TABLES) {
      const result = await db.$client.query<{ is_nullable: string }>(
        `select is_nullable from information_schema.columns
         where table_name = $1 and column_name = 'workspace_id'`,
        [table],
      );

      expect(result.rows.length, `${table} has no workspace_id column`).toBe(1);
      expect(
        result.rows[0]?.is_nullable,
        `${table}.workspace_id is nullable — a null would escape every tenant filter`,
      ).toBe('NO');
    }
  });

  it('no table classified as global carries a workspace_id', async () => {
    for (const table of GLOBAL_TABLES) {
      const columns = await columnsOf(table);
      expect(
        columns,
        `${table} is classified global but has a workspace_id — it is private data`,
      ).not.toContain('workspace_id');
    }
  });

  /**
   * The one that matters. Anything with a `workspace_id` must be deliberately
   * classified; an unclassified table is one nobody decided how to scope.
   */
  it('leaves no table with workspace_id unclassified', async () => {
    const classified = new Set<string>([...TENANT_TABLES, ...SHARED_OR_KEYED_TABLES]);

    const result = await db.$client.query<{ table_name: string }>(
      `select distinct table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'workspace_id'`,
    );

    const unclassified = result.rows
      .map((row) => row.table_name)
      .filter((name) => !classified.has(name));

    expect(
      unclassified,
      unclassified.length === 0
        ? ''
        : `\nThese tables carry workspace_id but are not classified in src/server/db/tenant.ts:\n` +
          `  ${unclassified.join(', ')}\n\n` +
          `Add each to TENANT_TABLES (private, NOT NULL workspace_id) or to\n` +
          `SHARED_OR_KEYED_TABLES (nullable workspace_id, where null is meaningful).\n`,
    ).toEqual([]);
  });

  it('classifies every table in the schema exactly once', () => {
    const all = [...schemaTables().keys()];
    const classified = [...TENANT_TABLES, ...SHARED_OR_KEYED_TABLES, ...GLOBAL_TABLES];

    const duplicates = classified.filter((name, index) => classified.indexOf(name) !== index);
    expect(duplicates, `classified in more than one list: ${duplicates.join(', ')}`).toEqual([]);

    const missing = all.filter((name) => !classified.includes(name as never));
    expect(
      missing,
      missing.length === 0 ? '' : `\nUnclassified tables: ${missing.join(', ')}\n`,
    ).toEqual([]);
  });
});
