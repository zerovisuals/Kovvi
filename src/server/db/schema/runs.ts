import { relations, sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  circuitState,
  inconclusiveReason,
  jobState,
  moduleId,
  runStatus,
  searchCadence,
  stageId,
} from './enums';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { workspace } from './tenancy';

/**
 * Research runs and the job queue that executes them.
 *
 * There is no Redis here; the database IS the queue, claimed with
 * `FOR UPDATE SKIP LOCKED` under a lease. That removes an entire piece of
 * infrastructure, and since every job already needs a durable row for progress
 * and billing, the queue costs almost nothing on top.
 */

export type RunCoverage = {
  adapterKey: string;
  label: string;
  attempted: number;
  ok: number;
  failed: number;
  /** True when the adapter could not run at all — usually missing credentials. */
  absent: boolean;
  note?: string;
};

export const researchRun = pgTable(
  'research_run',
  {
    id: id('researchRun'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    savedSearchId: text('saved_search_id'),

    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    moduleIds: moduleId('module_ids').array().notNull().default([]),

    /* ── Budget, as a hard ceiling the user set before starting ───────────
       The brief requires a cost estimate and a bounded limit up front. Once
       `unitsReserved` reaches `unitCap` the run stops cleanly and KEEPS what it
       already found — acceptance case 10. A run that blows a budget and
       discards its partial results has wasted the money twice. */
    unitCap: integer('unit_cap').notNull(),
    unitsReserved: integer('units_reserved').notNull().default(0),
    unitsFinalised: integer('units_finalised').notNull().default(0),
    unitsRefunded: integer('units_refunded').notNull().default(0),

    status: runStatus('status').notNull().default('queued'),

    /**
     * Per-adapter outcome, including adapters that could not run. This is what
     * makes "partial results" an honest, visible state instead of a silently
     * shorter list — the user can see that six sources answered and one was
     * unavailable.
     */
    coverage: jsonb('coverage').$type<RunCoverage[]>().notNull().default([]),

    startedAt: timestamptz('started_at'),
    finishedAt: timestamptz('finished_at'),

    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('research_run_workspace_idx').on(table.workspaceId, table.createdAt),
    index('research_run_status_idx').on(table.status),
  ],
);

export const job = pgTable(
  'job',
  {
    id: id('job'),
    runId: text('run_id').references(() => researchRun.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),

    stage: stageId('stage').notNull(),
    state: jobState('state').notNull().default('queued'),

    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb('output').$type<Record<string, unknown>>(),

    /** Set when the job finished `inconclusive` — a success, not a failure. */
    inconclusiveReason: inconclusiveReason('inconclusive_reason'),
    inconclusiveDetail: text('inconclusive_detail'),

    attempt: integer('attempt').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),

    /**
     * Makes retries, webhook replays and duplicate enqueues idempotent. The
     * usage ledger shares this key, so a job cannot be charged twice however
     * many times it is delivered — acceptance case 7.
     */
    idempotencyKey: text('idempotency_key').notNull(),

    /** Units reserved for this job; refunded verbatim if it fails. */
    costUnits: integer('cost_units').notNull().default(0),

    scheduledAt: timestamptz('scheduled_at').notNull().defaultNow(),
    claimedBy: text('claimed_by'),
    claimedAt: timestamptz('claimed_at'),
    /** A worker that dies mid-job leaves this behind; the reaper requeues it. */
    leaseUntil: timestamptz('lease_until'),
    finishedAt: timestamptz('finished_at'),

    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('job_idempotency_unique').on(table.idempotencyKey),
    /** The claim query's index: only queued rows, ordered by schedule. */
    index('job_claimable_idx')
      .on(table.scheduledAt)
      .where(sql`state = 'queued'`),
    index('job_run_stage_idx').on(table.runId, table.stage),
    index('job_lease_idx')
      .on(table.leaseUntil)
      .where(sql`state in ('claimed','running')`),
    index('job_workspace_idx').on(table.workspaceId),
  ],
);

/**
 * One outbound call to an external provider.
 *
 * Deliberately records no response bodies and no credentials — enough to
 * explain a cost or diagnose a failure, and nothing that would turn the logs
 * into a second copy of the data.
 */
export const providerCall = pgTable(
  'provider_call',
  {
    id: id('providerCall'),
    jobId: text('job_id').references(() => job.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    capabilityId: text('capability_id').notNull(),
    requestHash: text('request_hash'),
    httpStatus: integer('http_status'),
    latencyMs: integer('latency_ms'),
    costUnits: integer('cost_units').notNull().default(0),
    error: text('error'),
    createdAt: createdAt(),
  },
  (table) => [
    index('provider_call_job_idx').on(table.jobId),
    index('provider_call_provider_idx').on(table.provider, table.createdAt),
  ],
);

/**
 * Circuit breaker state per provider.
 *
 * When a provider starts failing, dependent stages return
 * `inconclusive('source_unavailable')` rather than retrying into a wall. That
 * surfaces in the run's coverage as an honest gap instead of burning the
 * user's budget on calls that were never going to succeed.
 */
export const providerCircuit = pgTable('provider_circuit', {
  provider: text('provider').primaryKey(),
  state: circuitState('state').notNull().default('closed'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  openedAt: timestamptz('opened_at'),
  cooldownUntil: timestamptz('cooldown_until'),
  updatedAt: updatedAt(),
});

export const savedSearch = pgTable(
  'saved_search',
  {
    id: id('savedSearch'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    moduleIds: moduleId('module_ids').array().notNull().default([]),
    cadence: searchCadence('cadence').notNull().default('manual'),
    lastRunAt: timestamptz('last_run_at'),
    /** Set when the user marks themselves booked; no point generating leads. */
    paused: boolean('paused').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('saved_search_workspace_idx').on(table.workspaceId)],
);

export const researchRunRelations = relations(researchRun, ({ many, one }) => ({
  workspace: one(workspace, {
    fields: [researchRun.workspaceId],
    references: [workspace.id],
  }),
  jobs: many(job),
}));

export const jobRelations = relations(job, ({ many, one }) => ({
  run: one(researchRun, { fields: [job.runId], references: [researchRun.id] }),
  providerCalls: many(providerCall),
}));

export const savedSearchRelations = relations(savedSearch, ({ one }) => ({
  workspace: one(workspace, {
    fields: [savedSearch.workspaceId],
    references: [workspace.id],
  }),
}));
