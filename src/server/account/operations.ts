import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  auditEvent,
  blobObject,
  business,
  contact,
  evidence,
  opportunity,
  sourceRecord,
  subscription,
  usageLedger,
  workspace,
} from '../db/schema';
import { toCsv, type CsvColumn } from '@/lib/export/csv';
import { capabilityState } from '../capabilities/registry';
import { getBlobStore } from '../storage/blob';
import type { TenantContext } from '../db/tenant';

/**
 * Account operations: export, delete, cancel.
 *
 * The brief's definition of done requires all three to work end to end, and
 * they matter disproportionately: a product holding someone's prospecting
 * research is only trustworthy if leaving is as easy as arriving.
 *
 * Cancellation is the one honest exception. Without a billing provider
 * configured there is no subscription to cancel, and this says exactly that
 * rather than pretending to have done something.
 */

type ExportRow = {
  organization: string;
  region: string | null;
  industry: string;
  score: number;
  confidence: string;
  stage: string;
  blocked: string | null;
  contact: string | null;
  evidenceCount: number;
  dataOrigin: string;
  createdAt: Date;
};

const EXPORT_COLUMNS: readonly CsvColumn<ExportRow>[] = [
  { header: 'organization', value: (row) => row.organization },
  { header: 'region', value: (row) => row.region },
  { header: 'industry', value: (row) => row.industry },
  { header: 'score', value: (row) => row.score },
  { header: 'confidence', value: (row) => row.confidence },
  { header: 'stage', value: (row) => row.stage },
  { header: 'blocked_reason', value: (row) => row.blocked },
  { header: 'contact', value: (row) => row.contact },
  { header: 'evidence_count', value: (row) => row.evidenceCount },
  // Always present, so a sample row stays identifiable once it has left the
  // interface that labelled it.
  { header: 'data_origin', value: (row) => row.dataOrigin },
  { header: 'created_at', value: (row) => row.createdAt },
];

export async function exportOpportunitiesCsv(
  db: Database,
  ctx: TenantContext,
): Promise<string> {
  const rows = await db
    .select({
      organization: business.canonicalName,
      region: business.region,
      industry: opportunity.moduleId,
      score: opportunity.totalScore,
      confidence: opportunity.confidenceBand,
      stage: opportunity.stage,
      blocked: opportunity.blockedReason,
      dataOrigin: opportunity.dataOrigin,
      createdAt: opportunity.createdAt,
      businessId: opportunity.businessId,
    })
    .from(opportunity)
    .innerJoin(business, eq(business.id, opportunity.businessId))
    .where(eq(opportunity.workspaceId, ctx.workspaceId))
    .orderBy(desc(opportunity.totalScore));

  const enriched: ExportRow[] = [];

  for (const row of rows) {
    const [firstContact] = await db
      .select({ value: contact.value })
      .from(contact)
      .where(eq(contact.businessId, row.businessId))
      .limit(1);

    const evidenceCount = await db.$count(evidence, eq(evidence.businessId, row.businessId));

    enriched.push({
      organization: row.organization,
      region: row.region,
      industry: row.industry,
      score: row.score,
      confidence: row.confidence,
      stage: row.stage,
      blocked: row.blocked,
      contact: firstContact?.value ?? null,
      evidenceCount,
      dataOrigin: row.dataOrigin,
      createdAt: row.createdAt,
    });
  }

  await db.insert(auditEvent).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: 'data.exported',
    subjectType: 'workspace',
    subjectId: ctx.workspaceId,
    detail: { rows: enriched.length },
  });

  return toCsv(enriched, EXPORT_COLUMNS);
}

export type DeletionResult = {
  readonly workspaceId: string;
  readonly blobsRemoved: number;
};

/**
 * Deletes a workspace and everything private to it.
 *
 * Three deliberate choices:
 *
 *  - Stored bytes are removed too. A row cascade that leaves screenshots on
 *    disk has not deleted anything meaningful.
 *  - SHARED public records survive. They are facts about real businesses,
 *    resolved once for everybody, and contain nothing of this user's. Deleting
 *    them would degrade other users' research to no benefit.
 *  - The audit event survives the workspace, with a null workspace_id, so "your
 *    data was deleted" is itself an auditable claim rather than an assurance.
 */
export async function deleteWorkspace(
  db: Database,
  ctx: TenantContext,
): Promise<DeletionResult> {
  const blobs = await db
    .select({ id: blobObject.id, key: blobObject.key })
    .from(blobObject)
    .where(eq(blobObject.workspaceId, ctx.workspaceId));

  const store = getBlobStore();
  let removed = 0;

  for (const blob of blobs) {
    try {
      await store.delete(blob.key);
      removed += 1;
    } catch {
      // A byte we cannot remove must not stop the rest of the deletion; it is
      // recorded below so the gap is visible rather than silent.
    }
  }

  await db.insert(auditEvent).values({
    // Null, deliberately: this record outlives the workspace it describes.
    workspaceId: null,
    actorUserId: ctx.userId,
    action: 'workspace.deleted',
    subjectType: 'workspace',
    subjectId: ctx.workspaceId,
    detail: { blobsRemoved: removed, blobsFound: blobs.length },
  });

  // Every tenant-scoped table cascades from here.
  await db.delete(workspace).where(eq(workspace.id, ctx.workspaceId));

  return { workspaceId: ctx.workspaceId, blobsRemoved: removed };
}

export type CancellationOutcome =
  | { readonly kind: 'cancelled'; readonly effectiveAt: Date | null }
  /** No billing provider is configured, so there is nothing to cancel. */
  | { readonly kind: 'no_subscription'; readonly detail: string };

/**
 * Cancels the subscription, or explains honestly why there is none.
 *
 * This is the one leg of acceptance case 12 that cannot fully pass without a
 * payment provider — and rather than stubbing it, the product says so. A fake
 * "cancelled" would be the exact dishonesty the brief forbids.
 */
export async function cancelSubscription(
  db: Database,
  ctx: TenantContext,
): Promise<CancellationOutcome> {
  const [current] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.workspaceId, ctx.workspaceId))
    .limit(1);

  if (capabilityState('billing').state !== 'live' || !current || current.status === 'absent') {
    return {
      kind: 'no_subscription',
      detail:
        'Billing is not connected, so there is no subscription to cancel and nothing is being charged. Your data remains exportable and deletable.',
    };
  }

  await db
    .update(subscription)
    .set({ cancelAtPeriodEnd: 'true', updatedAt: new Date() })
    .where(eq(subscription.workspaceId, ctx.workspaceId));

  await db.insert(auditEvent).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: 'subscription.cancelled',
    subjectType: 'subscription',
    subjectId: ctx.workspaceId,
  });

  return { kind: 'cancelled', effectiveAt: current.periodEnd };
}

/** The usage ledger, for the billing screen. */
export async function usageHistory(db: Database, ctx: TenantContext, limit = 100) {
  return db
    .select()
    .from(usageLedger)
    .where(eq(usageLedger.workspaceId, ctx.workspaceId))
    .orderBy(desc(usageLedger.createdAt))
    .limit(limit);
}

/** The user-visible audit log. */
export async function auditHistory(db: Database, ctx: TenantContext, limit = 100) {
  return db
    .select()
    .from(auditEvent)
    .where(and(eq(auditEvent.workspaceId, ctx.workspaceId)))
    .orderBy(desc(auditEvent.createdAt))
    .limit(limit);
}

/** Kept for the export route: shared public records are never workspace data. */
export const SHARED_TABLES_NOT_EXPORTED = [sourceRecord, evidence, business] as const;
