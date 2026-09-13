import { relations } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  blockReason,
  confidence,
  dataOrigin,
  moduleId,
  pipelineStage,
} from './enums';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { workspace } from './tenancy';
import { business } from './identity';
import { portfolioProject } from './profile';

/**
 * A business, considered as a prospect for one particular freelancer.
 *
 * This is the tenant-private layer on top of the shared public facts. Two users
 * researching the same restaurant share its identity, evidence and website
 * assessment — but their fit, their notes, their messages and their outcome are
 * their own and never visible to each other.
 */

export const opportunity = pgTable(
  'opportunity',
  {
    id: id('opportunity'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    /** The module that surfaced it first; others are recorded as module hits. */
    moduleId: moduleId('module_id').notNull(),

    /**
     * SHA-256 of the business id. Combined with the unique index below, this is
     * what makes a business found by two different modules ONE opportunity
     * rather than two — and therefore charged once (acceptance case 15).
     */
    dedupeKey: text('dedupe_key').notNull(),

    /* ── Ranking, kept as separate components ─────────────────────────────
       The brief requires fit, evidence, timing, activity and contactability to
       be shown separately rather than collapsed into one number. A single
       score hides WHY something ranked, which is exactly what a user needs to
       judge whether to trust it. The weights (30/25/20/15/10) are a starting
       heuristic and the UI labels them as such — they are not calibrated
       purchase probabilities and must never be presented as such. */
    fitScore: integer('fit_score').notNull().default(0),
    evidenceScore: integer('evidence_score').notNull().default(0),
    timingScore: integer('timing_score').notNull().default(0),
    activityScore: integer('activity_score').notNull().default(0),
    contactabilityScore: integer('contactability_score').notNull().default(0),
    totalScore: integer('total_score').notNull().default(0),

    /** High/Medium/Low, never a percentage. */
    confidenceBand: confidence('confidence_band').notNull().default('low'),

    stage: pipelineStage('stage').notNull().default('discovered'),

    /**
     * Why this cannot be contacted, whatever it scores. An unresolved identity
     * conflict blocks outreach outright — you do not email a business you
     * cannot reliably tell apart from another one.
     */
    blockedReason: blockReason('blocked_reason'),

    excluded: boolean('excluded').notNull().default(false),
    excludedReason: text('excluded_reason'),

    /** The portfolio project this prospect is matched against, and why. */
    portfolioProjectId: text('portfolio_project_id').references(() => portfolioProject.id, {
      onDelete: 'set null',
    }),
    matchExplanation: jsonb('match_explanation')
      .$type<{ reason: string; claimIds?: string[] }[]>()
      .notNull()
      .default([]),

    dataOrigin: dataOrigin('data_origin').notNull().default('real'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('opportunity_dedupe_unique').on(table.workspaceId, table.dedupeKey),
    index('opportunity_workspace_stage_idx').on(table.workspaceId, table.stage),
    index('opportunity_workspace_score_idx').on(table.workspaceId, table.totalScore),
    index('opportunity_business_idx').on(table.businessId),
    index('opportunity_origin_idx').on(table.workspaceId, table.dataOrigin),
  ],
);

/**
 * Records that a module surfaced this opportunity.
 *
 * The second and subsequent hits add a row here instead of creating another
 * opportunity — so the UI can say "found by fashion and esports" without the
 * user being shown, or billed for, the same business twice.
 */
export const opportunityModuleHit = pgTable(
  'opportunity_module_hit',
  {
    id: id('moduleHit'),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunity.id, { onDelete: 'cascade' }),
    moduleId: moduleId('module_id').notNull(),
    runId: text('run_id'),
    discoveredAt: timestamptz('discovered_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('opportunity_module_hit_unique').on(table.opportunityId, table.moduleId),
    index('opportunity_module_hit_run_idx').on(table.runId),
  ],
);

/**
 * The inputs behind each score component, with the evidence that produced them.
 *
 * Without this a score is a bare number the user has to take on faith. With it,
 * the opportunity detail can show that timing scored 18 because of a dated
 * launch announcement, and link straight to the announcement.
 */
export const opportunityScoreInput = pgTable(
  'opportunity_score_input',
  {
    id: id('scoreInput'),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunity.id, { onDelete: 'cascade' }),

    component: text('component').notNull(),
    label: text('label').notNull(),
    contribution: integer('contribution').notNull(),
    evidenceId: text('evidence_id'),
    createdAt: createdAt(),
  },
  (table) => [index('opportunity_score_input_idx').on(table.opportunityId, table.component)],
);

export const opportunityRelations = relations(opportunity, ({ many, one }) => ({
  workspace: one(workspace, {
    fields: [opportunity.workspaceId],
    references: [workspace.id],
  }),
  business: one(business, {
    fields: [opportunity.businessId],
    references: [business.id],
  }),
  portfolioProject: one(portfolioProject, {
    fields: [opportunity.portfolioProjectId],
    references: [portfolioProject.id],
  }),
  moduleHits: many(opportunityModuleHit),
  scoreInputs: many(opportunityScoreInput),
}));

export const opportunityModuleHitRelations = relations(opportunityModuleHit, ({ one }) => ({
  opportunity: one(opportunity, {
    fields: [opportunityModuleHit.opportunityId],
    references: [opportunity.id],
  }),
}));

export const opportunityScoreInputRelations = relations(opportunityScoreInput, ({ one }) => ({
  opportunity: one(opportunity, {
    fields: [opportunityScoreInput.opportunityId],
    references: [opportunity.id],
  }),
}));
