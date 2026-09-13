import { relations } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import {
  assessmentStatus,
  captureKind,
  claimClass,
  confidence,
  dataOrigin,
  identityStatus,
  inconclusiveReason,
  viewport,
} from './enums';
import { createdAt, id, timestamptz } from './columns';
import { business } from './identity';
import { evidence } from './evidence';
import { workspace } from './tenancy';

/**
 * Is this the business's real website, and what is actually wrong with it?
 *
 * Two separate questions, deliberately separated into two tables. Answering the
 * second without having answered the first is how these tools end up critiquing
 * a squatted domain or a competitor's site.
 */

/**
 * A domain that might belong to a business, and how confident we are.
 *
 * `identityStatus` has no null and no bare "none". `none_found_after_search`
 * asserts that a search happened, and `searchedVia` records what was tried —
 * a claim we can defend. "No website" as a bare fact is not one.
 */
export const websiteCandidate = pgTable(
  'website_candidate',
  {
    id: id('websiteCandidate'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    url: text('url'),
    normalisedHost: text('normalised_host'),

    identityStatus: identityStatus('identity_status').notNull().default('probable'),
    identityConfidence: confidence('identity_confidence').notNull().default('low'),

    /**
     * The individual resolution signals, each with the evidence id that
     * supports it: reciprocal link, brand name in title, regional TLD,
     * ownership cross-link, matching social handle. Shown in the UI so a user
     * can see WHY we think a domain is official, and correct us when it is not.
     */
    signals: jsonb('signals')
      .$type<{ signal: string; weight: number; evidenceId?: string }[]>()
      .notNull()
      .default([]),

    /** Which searches were performed. Makes `none_found_after_search` defensible. */
    searchedVia: text('searched_via').array().notNull().default([]),
    searchedAt: timestamptz('searched_at'),
    decidedAt: timestamptz('decided_at'),

    dataOrigin: dataOrigin('data_origin').notNull().default('real'),
    createdAt: createdAt(),
  },
  (table) => [
    index('website_candidate_business_idx').on(table.businessId),
    index('website_candidate_host_idx').on(table.normalisedHost),
    index('website_candidate_status_idx').on(table.identityStatus),
  ],
);

/**
 * One inspection run against a confirmed domain.
 *
 * `inconclusive_blocked` and `inconclusive_timeout` are SUCCESS outcomes, not
 * failures: a site that blocked us has told us nothing about its quality, and
 * recording that honestly is the whole point. Acceptance case 4 asserts that a
 * blocked inspection produces zero findings — never a fabricated defect.
 *
 * `workspaceId` is nullable: an assessment of a public website is a public
 * fact and is shared between workspaces, which is also what stops two users
 * paying twice for the same work.
 */
export const assessment = pgTable(
  'assessment',
  {
    id: id('assessment'),
    websiteCandidateId: text('website_candidate_id')
      .notNull()
      .references(() => websiteCandidate.id, { onDelete: 'cascade' }),

    /** Null means a shared assessment of a public site. */
    workspaceId: text('workspace_id').references(() => workspace.id, { onDelete: 'cascade' }),

    status: assessmentStatus('status').notNull(),
    /** Populated when status is one of the `inconclusive_*` values. */
    inconclusiveReason: inconclusiveReason('inconclusive_reason'),
    blockedDetail: text('blocked_detail'),

    /** Which ruleset and engine produced this, so old results stay interpretable. */
    rulesetVersion: text('ruleset_version').notNull(),
    engineVersion: text('engine_version').notNull(),

    pagesVisited: integer('pages_visited').notNull().default(0),

    startedAt: timestamptz('started_at').notNull().defaultNow(),
    finishedAt: timestamptz('finished_at'),

    dataOrigin: dataOrigin('data_origin').notNull().default('real'),
    createdAt: createdAt(),
  },
  (table) => [
    index('assessment_candidate_idx').on(table.websiteCandidateId, table.startedAt),
    index('assessment_workspace_idx').on(table.workspaceId),
    index('assessment_status_idx').on(table.status),
  ],
);

/**
 * One thing observed about a website.
 *
 * `classification` is the same three-way split as evidence: an objective
 * defect, a subjective observation, or a commercial hypothesis. A finding also
 * points at the capture that shows it, so a claim about a website can always be
 * seen rather than taken on trust.
 */
export const finding = pgTable(
  'finding',
  {
    id: id('finding'),
    assessmentId: text('assessment_id')
      .notNull()
      .references(() => assessment.id, { onDelete: 'cascade' }),

    ruleKey: text('rule_key').notNull(),
    classification: claimClass('classification').notNull(),
    /** 1 (minor) to 5 (blocking). Never presented as a score out of 100. */
    severity: integer('severity').notNull().default(3),

    summary: text('summary').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),

    /** The page and viewport the finding was observed on. */
    observedUrl: text('observed_url'),
    captureId: text('capture_id'),

    /** Null for findings derived from the page structure rather than a quote. */
    evidenceId: text('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),

    createdAt: createdAt(),
  },
  (table) => [
    index('finding_assessment_idx').on(table.assessmentId),
    index('finding_rule_idx').on(table.ruleKey),
  ],
);

/** A screenshot or DOM snapshot, stored in blob storage and served authorised. */
export const capture = pgTable(
  'capture',
  {
    id: id('capture'),
    assessmentId: text('assessment_id')
      .notNull()
      .references(() => assessment.id, { onDelete: 'cascade' }),

    kind: captureKind('kind').notNull().default('screenshot'),
    viewport: viewport('viewport').notNull(),
    url: text('url').notNull(),

    blobRef: text('blob_ref').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),

    takenAt: timestamptz('taken_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [index('capture_assessment_idx').on(table.assessmentId, table.viewport)],
);

export const websiteCandidateRelations = relations(websiteCandidate, ({ many, one }) => ({
  business: one(business, {
    fields: [websiteCandidate.businessId],
    references: [business.id],
  }),
  assessments: many(assessment),
}));

export const assessmentRelations = relations(assessment, ({ many, one }) => ({
  candidate: one(websiteCandidate, {
    fields: [assessment.websiteCandidateId],
    references: [websiteCandidate.id],
  }),
  findings: many(finding),
  captures: many(capture),
}));

export const findingRelations = relations(finding, ({ one }) => ({
  assessment: one(assessment, {
    fields: [finding.assessmentId],
    references: [assessment.id],
  }),
}));

export const captureRelations = relations(capture, ({ one }) => ({
  assessment: one(assessment, {
    fields: [capture.assessmentId],
    references: [assessment.id],
  }),
}));
