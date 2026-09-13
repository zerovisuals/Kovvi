import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { researchRun, type RunCoverage } from '../schema';
import type { TenantContext } from '../tenant';

/**
 * Research runs, scoped to one workspace.
 *
 * Coverage is read separately and often, because it is what turns a list of
 * results into an honest one: without it, a short list and an incomplete list
 * look exactly the same to the person deciding whether a market is worth
 * pursuing.
 */

export async function latestRunCoverage(
  db: Database,
  ctx: TenantContext,
): Promise<readonly RunCoverage[]> {
  const [latest] = await db
    .select({ coverage: researchRun.coverage })
    .from(researchRun)
    .where(eq(researchRun.workspaceId, ctx.workspaceId))
    .orderBy(desc(researchRun.createdAt))
    .limit(1);

  return latest?.coverage ?? [];
}

export async function listRuns(db: Database, ctx: TenantContext, limit = 20) {
  return db
    .select()
    .from(researchRun)
    .where(eq(researchRun.workspaceId, ctx.workspaceId))
    .orderBy(desc(researchRun.createdAt))
    .limit(limit);
}

export async function getRun(db: Database, ctx: TenantContext, runId: string) {
  const [row] = await db
    .select()
    .from(researchRun)
    .where(and(eq(researchRun.id, runId), eq(researchRun.workspaceId, ctx.workspaceId)))
    .limit(1);

  return row;
}
