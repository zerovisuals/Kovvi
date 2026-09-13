import { relations } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  blobBackend,
  ledgerKind,
  subscriptionStatus,
  suppressionReason,
  suppressionScope,
  unitType,
} from './enums';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { user, workspace } from './tenancy';

/**
 * Operational controls: who must not be contacted, what was spent, what
 * happened, and where the bytes live.
 */

/**
 * Do-not-contact. Checked in the same transaction as dispatch, never earlier —
 * an opt-out that arrives while a batch is scheduled must still take effect.
 *
 * A null `workspaceId` is a global suppression (a hard bounce, a complaint);
 * those apply to everyone, because one user's mistake should not become another
 * user's problem.
 */
export const suppression = pgTable(
  'suppression',
  {
    id: id('suppression'),
    workspaceId: text('workspace_id').references(() => workspace.id, { onDelete: 'cascade' }),
    scope: suppressionScope('scope').notNull(),
    /** SHA-256 of the normalised value; the raw address is not stored here. */
    valueHash: text('value_hash').notNull(),
    reason: suppressionReason('reason').notNull(),
    note: text('note'),
    /** Null means permanent. Opt-outs never expire. */
    expiresAt: timestamptz('expires_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('suppression_unique').on(table.workspaceId, table.scope, table.valueHash),
    index('suppression_lookup_idx').on(table.scope, table.valueHash),
  ],
);

/**
 * THE USAGE LEDGER
 *
 * Balance is the SUM of this table, never a mutated counter. Every entry is
 * append-only and signed:
 *
 *   reserve   −n  taken when a costly job is enqueued
 *   finalise   0  the reserve becomes permanent (0 units: already debited)
 *   refund    +n  the job failed; the user keeps their allowance
 *   grant     +n  a plan period's allowance
 *   expire    −n  unused allowance at period end
 *
 * `idempotencyKey` is shared with the job, so a retry or a replayed webhook
 * cannot charge twice (acceptance case 7). A counter would make double-charging
 * a race condition; a ledger makes it impossible and auditable.
 *
 * Note that an `inconclusive` job DOES finalise. The work genuinely happened —
 * fetching a site that blocked us costs the same as one that did not — and
 * making blocked inspections free would be an obvious way to run up someone
 * else's bill. The billing screen shows that line explicitly rather than
 * burying it.
 */
export const usageLedger = pgTable(
  'usage_ledger',
  {
    id: id('usageLedger'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),

    kind: ledgerKind('kind').notNull(),
    unitType: unitType('unit_type').notNull(),
    /** Signed. Negative debits, positive credits. */
    units: integer('units').notNull(),

    runId: text('run_id'),
    jobId: text('job_id'),

    idempotencyKey: text('idempotency_key').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('usage_ledger_idempotency_unique').on(table.idempotencyKey),
    index('usage_ledger_workspace_idx').on(table.workspaceId, table.createdAt),
    index('usage_ledger_run_idx').on(table.runId),
  ],
);

/**
 * Subscription state.
 *
 * Defaults to `absent`, which is the honest value when billing is not
 * configured — not a convenient fake `active`. The billing screen renders it as
 * a real state explaining that billing is not connected. Plan allowances still
 * apply, so usage accounting is exercised for real either way.
 */
export const subscription = pgTable(
  'subscription',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    provider: text('provider'),
    externalId: text('external_id'),
    status: subscriptionStatus('status').notNull().default('absent'),
    planKey: text('plan_key').notNull().default('pro'),
    periodStart: timestamptz('period_start'),
    periodEnd: timestamptz('period_end'),
    cancelAtPeriodEnd: text('cancel_at_period_end'),
    updatedAt: updatedAt(),
  },
  (table) => [index('subscription_status_idx').on(table.status)],
);

/**
 * User-visible audit history.
 *
 * Visible in settings, not just written to a log file — the brief asks for a
 * user-visible audit history, and a user who cannot see what the system did on
 * their behalf has no way to trust it. Survives workspace deletion so that
 * "your data was deleted" is itself an auditable claim.
 */
export const auditEvent = pgTable(
  'audit_event',
  {
    id: id('auditEvent'),
    workspaceId: text('workspace_id'),
    /** Null when the actor was the system rather than a person. */
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),

    action: text('action').notNull(),
    subjectType: text('subject_type'),
    subjectId: text('subject_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),

    createdAt: createdAt(),
  },
  (table) => [
    index('audit_event_workspace_idx').on(table.workspaceId, table.createdAt),
    index('audit_event_action_idx').on(table.action),
  ],
);

/**
 * Stored bytes: screenshots, DOM snapshots, retained source bodies.
 *
 * The row is the index; the backend holds the bytes. `fs` in development and
 * `s3` in a serverless deployment, behind one interface — so retention and
 * deletion controls operate on rows here regardless of where the bytes live.
 */
export const blobObject = pgTable(
  'blob_object',
  {
    id: id('blobObject'),
    workspaceId: text('workspace_id').references(() => workspace.id, { onDelete: 'cascade' }),
    backend: blobBackend('backend').notNull().default('fs'),
    key: text('key').notNull(),
    contentType: text('content_type').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull().default(0),
    sha256: text('sha256'),
    /** Retention: captures are pruned after their window. */
    expiresAt: timestamptz('expires_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('blob_object_key_unique').on(table.backend, table.key),
    index('blob_object_workspace_idx').on(table.workspaceId),
    index('blob_object_expiry_idx').on(table.expiresAt),
  ],
);

export const usageLedgerRelations = relations(usageLedger, ({ one }) => ({
  workspace: one(workspace, {
    fields: [usageLedger.workspaceId],
    references: [workspace.id],
  }),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  workspace: one(workspace, {
    fields: [subscription.workspaceId],
    references: [workspace.id],
  }),
}));
