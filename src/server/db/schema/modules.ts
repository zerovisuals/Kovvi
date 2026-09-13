import { relations } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { accessMethod, claimClass, failureBehaviour, moduleId } from './enums';
import { createdAt, id, updatedAt } from './columns';

/**
 * Industry modules: what makes this multi-niche rather than generic.
 *
 * A fashion label needs a different assessment from a consultancy or an esports
 * organisation. Each module declares its own filters, sources, assessment rules
 * and — critically — its own COVERAGE, so the product can say plainly which
 * industries it genuinely supports and which it does not.
 *
 * This configuration is seeded and versioned, not user-editable. Versioning
 * matters because an assessment made under ruleset v2 must stay interpretable
 * after v3 ships.
 */

export const nicheModule = pgTable(
  'niche_module',
  {
    id: id('benchmarkCase'),
    moduleId: moduleId('module_id').notNull(),
    version: integer('version').notNull().default(1),

    label: text('label').notNull(),
    description: text('description').notNull(),

    /** A serialised zod schema; the research setup renders filters from it. */
    filterSchema: jsonb('filter_schema').$type<Record<string, unknown>>().notNull().default({}),

    /**
     * Whether this module can actually discover anything right now.
     *
     * Declared-but-not-covered is a legitimate, visible state: the brief
     * requires showing source coverage honestly rather than pretending to
     * support an industry whose sources have not been built. The research setup
     * screen renders this verbatim.
     */
    discoveryAvailable: boolean('discovery_available').notNull().default(false),
    coverageNote: text('coverage_note').notNull(),

    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('niche_module_version_unique').on(table.moduleId, table.version)],
);

/**
 * A source of candidate businesses.
 *
 * `capabilityId` ties an adapter to the capability registry, so an adapter
 * whose credentials are missing reports itself unavailable and the run records
 * partial coverage — rather than silently returning a shorter list, which would
 * look identical to "there were fewer results".
 */
export const sourceAdapter = pgTable(
  'source_adapter',
  {
    id: id('sourceAdapter'),
    adapterKey: text('adapter_key').notNull(),
    label: text('label').notNull(),

    moduleIds: moduleId('module_ids').array().notNull().default([]),
    accessMethod: accessMethod('access_method').notNull(),

    /** Matches a key in src/server/capabilities/registry.ts. */
    capabilityId: text('capability_id').notNull(),

    /** How long results from this source stay fresh. */
    freshnessDays: integer('freshness_days').notNull().default(30),
    rateLimitPerMin: integer('rate_limit_per_min').notNull().default(30),
    paginationKind: text('pagination_kind'),
    failureBehaviour: failureBehaviour('failure_behaviour').notNull().default('partial_coverage'),

    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('source_adapter_key_unique').on(table.adapterKey)],
);

/**
 * One rule a website is checked against.
 *
 * The `classification` here is what stops "no visible booking link" being
 * reported as a defect when the venue simply books through a third-party
 * platform — acceptance case 14. A rule declares up front what KIND of
 * statement it makes.
 */
export const assessmentRule = pgTable(
  'assessment_rule',
  {
    id: id('assessmentRule'),
    ruleKey: text('rule_key').notNull(),
    moduleId: moduleId('module_id').notNull(),
    version: integer('version').notNull().default(1),

    label: text('label').notNull(),
    classification: claimClass('classification').notNull(),
    severity: integer('severity').notNull().default(3),

    /** Declarative predicate evaluated against the inspection result. */
    predicate: jsonb('predicate').$type<Record<string, unknown>>().notNull().default({}),

    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('assessment_rule_unique').on(table.ruleKey, table.moduleId, table.version),
    index('assessment_rule_module_idx').on(table.moduleId),
  ],
);

/**
 * A known input with a known correct answer, per module.
 *
 * The brief's definition of done requires each advertised module to pass its
 * own benchmark cases. Storing them makes "this module works" a claim the
 * product can re-check rather than a claim someone once made.
 */
export const moduleBenchmarkCase = pgTable(
  'module_benchmark_case',
  {
    id: id('benchmarkCase'),
    moduleId: moduleId('module_id').notNull(),
    name: text('name').notNull(),
    fixturePath: text('fixture_path').notNull(),
    expectation: jsonb('expectation').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('benchmark_case_unique').on(table.moduleId, table.name)],
);

export const nicheModuleRelations = relations(nicheModule, ({ many }) => ({
  benchmarkCases: many(moduleBenchmarkCase),
}));
