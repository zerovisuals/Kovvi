import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { workspace } from './tenancy';
import { confidence, moduleId } from './enums';
import { createdAt, id, timestamptz, updatedAt } from './columns';

/**
 * What the freelancer sells, and the work that proves they can.
 *
 * This is the side of the match that makes Kovvi's prospecting portfolio-aware
 * rather than generic, so its accuracy matters as much as the prospect's. The
 * governing rule from the brief: the user CONFIRMS extracted claims before they
 * are used. Nothing here is trusted merely because a scraper produced it.
 */

export const serviceProfile = pgTable(
  'service_profile',
  {
    id: id('serviceProfile'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),

    headline: text('headline'),
    /** What they sell, e.g. "ecommerce redesign", "brand site build". */
    services: text('services').array().notNull().default([]),

    /** Below this, a lead is not worth the conversation. Filters discovery. */
    minProjectPriceCents: integer('min_project_price_cents'),
    currency: text('currency').notNull().default('EUR'),

    /** ISO country or region codes the user will work with. */
    regions: text('regions').array().notNull().default([]),
    /**
     * Languages the user can hold a sales conversation in. A communication
     * preference — explicitly NOT an offer to do translation work.
     */
    languages: text('languages').array().notNull().default([]),
    /** Domains, business names or handles never to approach. */
    exclusions: text('exclusions').array().notNull().default([]),

    /**
     * Until this is set, the profile is a draft: discovery refuses to run
     * rather than matching against claims the user has not stood behind.
     */
    confirmedAt: timestamptz('confirmed_at'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // One profile per workspace. The whole product reads it with `limit(1)` and
  // writes it as an upsert, so the uniqueness is already assumed everywhere —
  // declaring it here is what makes the assumption true rather than lucky.
  (table) => [uniqueIndex('service_profile_workspace_unique').on(table.workspaceId)],
);

export const portfolioProject = pgTable(
  'portfolio_project',
  {
    id: id('portfolioProject'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),

    url: text('url').notNull(),
    title: text('title'),
    /** What the user actually did — design, build, both, or part of a team. */
    role: text('role'),
    summary: text('summary'),
    industryTags: moduleId('industry_tags').array().notNull().default([]),

    /**
     * The two the user nominates as representative. These are what outreach
     * drafts cite, so the choice is theirs rather than the ranker's.
     */
    isRepresentative: boolean('is_representative').notNull().default(false),

    capturedAt: timestamptz('captured_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('portfolio_project_workspace_idx').on(table.workspaceId),
    index('portfolio_project_representative_idx').on(table.workspaceId, table.isRepresentative),
  ],
);

/**
 * A single claim extracted from a portfolio project — "built on Shopify",
 * "handled the checkout redesign", "hospitality sector".
 *
 * Extraction is a guess until the user says otherwise. `confirmedByUser` gates
 * every downstream use: the ranker filters on it, and outreach drafts may only
 * cite confirmed claims. That is what stops Kovvi telling a prospect the user
 * has experience they do not have.
 */
export const profileClaim = pgTable(
  'profile_claim',
  {
    id: id('profileClaim'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    portfolioProjectId: text('portfolio_project_id')
      .notNull()
      .references(() => portfolioProject.id, { onDelete: 'cascade' }),

    claimType: text('claim_type').notNull(),
    value: text('value').notNull(),

    /** How sure the extractor was. Shown to the user while they confirm. */
    extractionConfidence: confidence('extraction_confidence').notNull().default('medium'),
    extractorVersion: text('extractor_version'),

    confirmedByUser: boolean('confirmed_by_user').notNull().default(false),
    confirmedAt: timestamptz('confirmed_at'),
    /** Set when the user corrected rather than accepted the extracted value. */
    editedByUser: boolean('edited_by_user').notNull().default(false),

    createdAt: createdAt(),
  },
  (table) => [
    index('profile_claim_project_idx').on(table.portfolioProjectId),
    index('profile_claim_confirmed_idx').on(table.workspaceId, table.confirmedByUser),
  ],
);

export const serviceProfileRelations = relations(serviceProfile, ({ one }) => ({
  workspace: one(workspace, {
    fields: [serviceProfile.workspaceId],
    references: [workspace.id],
  }),
}));

export const portfolioProjectRelations = relations(portfolioProject, ({ many, one }) => ({
  workspace: one(workspace, {
    fields: [portfolioProject.workspaceId],
    references: [workspace.id],
  }),
  claims: many(profileClaim),
}));

export const profileClaimRelations = relations(profileClaim, ({ one }) => ({
  project: one(portfolioProject, {
    fields: [profileClaim.portfolioProjectId],
    references: [portfolioProject.id],
  }),
}));
