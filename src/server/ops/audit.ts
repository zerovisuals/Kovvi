import type { Database } from '../db/client';
import { auditEvent } from '../db/schema';
import type { TenantContext } from '../db/tenant';

/**
 * Writing to the user-visible audit log.
 *
 * The log is a product surface, not a debugging aid — `/settings/data` renders
 * it — so entries are written with the reader in mind: an action name that
 * survives being read out of context, and a detail string short enough to sit
 * in a table row.
 */
export async function recordAudit(
  db: Database,
  ctx: TenantContext,
  entry: {
    readonly action: string;
    readonly subjectType?: string;
    readonly subjectId?: string;
    readonly detail?: string;
  },
): Promise<void> {
  await db.insert(auditEvent).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: entry.action,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    detail: entry.detail ? { note: entry.detail } : {},
  });
}
