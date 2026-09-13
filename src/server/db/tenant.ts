import { and, eq, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { getDb, type Database } from './client';
import * as schema from './schema';

/**
 * TENANT SCOPING
 *
 * Kovvi holds one user's prospect list, their messages, their prices and their
 * outcomes. A leak between workspaces is the worst thing this product could do,
 * so scoping is not left to whoever writes the next query.
 *
 * Two layers:
 *
 *  1. `TENANT_TABLES` enumerates every table carrying `workspaceId`, and
 *     `tests/guard/tenant-scoping.test.ts` fails the build if a new one appears
 *     that is not listed. Forgetting to scope a new table is a build error, not
 *     a security incident discovered later.
 *
 *  2. `withTenant` returns helpers that apply the workspace filter
 *     automatically, so the scoping cannot be omitted by accident.
 *
 * Deliberately absent: a `getEvidenceById(id)`-shaped function. Shared public
 * records are reached only by joining from a tenant-scoped opportunity, which
 * is what makes acceptance case 9 a consequence of the API's shape rather than
 * something a test has to catch after the fact.
 */

export type TenantContext = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: 'owner' | 'member';
};

/**
 * Every table with a `workspace_id` column. Kept as a literal list so the guard
 * test can compare it against the schema and detect anything new.
 */
export const TENANT_TABLES = [
  'service_profile',
  'portfolio_project',
  'profile_claim',
  'opportunity',
  'research_run',
  'job',
  'saved_search',
  'campaign',
  'message',
  'approval',
  'send_attempt',
  'follow_up_schedule',
  'conversation',
  'conversation_message',
  'outcome',
  'usage_ledger',
] as const;

/**
 * Tables with a NULLABLE `workspace_id`, where null means "shared" or "global".
 * They are listed separately because the guard must not demand strict scoping
 * of them, and because each null is a deliberate decision:
 *
 *   assessment    null = a shared assessment of a public website, which is
 *                 what stops two users paying twice for the same inspection
 *   suppression   null = a global do-not-contact (hard bounce, complaint)
 *   audit_event   null = a system action, or one outliving its workspace
 *   blob_object   null = bytes not owned by any single workspace
 *   membership    join table; scoped by its composite primary key
 *   workspace_preference / subscription  keyed BY workspace_id
 */
export const SHARED_OR_KEYED_TABLES = [
  'assessment',
  'suppression',
  'audit_event',
  'blob_object',
  'membership',
  'workspace_preference',
  'subscription',
] as const;

/** Tables that are deliberately global: public facts about real businesses. */
export const GLOBAL_TABLES = [
  'business',
  'brand',
  'business_alias',
  'business_relationship',
  'business_link',
  'identity_conflict',
  'location',
  'source_record',
  'evidence',
  'event',
  'website_candidate',
  'finding',
  'capture',
  'contact',
  'opportunity_module_hit',
  'opportunity_score_input',
  'provider_call',
  'provider_circuit',
  'niche_module',
  'source_adapter',
  'assessment_rule',
  'module_benchmark_case',
  'user',
  'session',
  'account',
  'workspace',
] as const;

/** Thrown when a record exists but belongs to another workspace. */
export class NotFoundError extends Error {
  constructor(what = 'Record') {
    // Deliberately "not found", never "forbidden": telling a caller that a
    // record exists but is not theirs leaks the fact that it exists.
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

type WorkspaceScoped = PgTable & { workspaceId: never };

/**
 * Scoped database access for one workspace.
 *
 * `where(table, ...conditions)` is the primitive: it ANDs the workspace filter
 * onto whatever else the caller asked for, so a query cannot be written that
 * forgets it.
 */
export class TenantDb {
  constructor(
    readonly ctx: TenantContext,
    readonly db: Database,
  ) {}

  /** Combines the workspace filter with any additional conditions. */
  scope<T extends { workspaceId: unknown }>(
    table: T,
    ...conditions: (SQL | undefined)[]
  ): SQL | undefined {
    return and(
      eq(table.workspaceId as never, this.ctx.workspaceId),
      ...conditions.filter((c): c is SQL => c !== undefined),
    );
  }

  /** Values for an insert, with the workspace injected. */
  own<T extends Record<string, unknown>>(values: T): T & { workspaceId: string } {
    return { ...values, workspaceId: this.ctx.workspaceId };
  }

  /**
   * Asserts a fetched row belongs to this workspace before it is used.
   * The last line of defence for a query written by hand.
   */
  assertOwned<T extends { workspaceId: string | null }>(row: T | undefined, what: string): T {
    if (!row || row.workspaceId !== this.ctx.workspaceId) {
      throw new NotFoundError(what);
    }
    return row;
  }

  get isSampleWorkspaceAllowedToSend(): boolean {
    // Sample workspaces exist to demonstrate the product, never to contact
    // anyone. Enforced here and asserted in the guard tests.
    return false;
  }
}

/** Runs `fn` with workspace-scoped access. */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (t: TenantDb) => Promise<T>,
): Promise<T> {
  return fn(new TenantDb(ctx, getDb()));
}

export { schema, type WorkspaceScoped };
