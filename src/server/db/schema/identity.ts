import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  aliasKind,
  brandStatus,
  businessMaturity,
  confidence,
  conflictStatus,
  dataOrigin,
  factReason,
  factState,
  moduleId,
  relationshipKind,
} from './enums';
import { createdAt, id, timestamptz, uncertainCheck, updatedAt } from './columns';
import { user } from './tenancy';

/**
 * Who a business actually is.
 *
 * These tables are GLOBAL, not tenant-scoped. Public facts about a business —
 * its name, its domain, who owns it — are the same for everyone, and resolving
 * them once is the expensive part of this product. What is private is the
 * workspace's *opportunity* built on top (see opportunity.ts): the fit, the
 * notes, the messages, the outcome.
 *
 * Identity is where this category most often lies. Two businesses share a
 * name; a directory omits a website; a company rebrands. The schema's job is
 * to make each of those representable rather than quietly resolved.
 */

export const business = pgTable(
  'business',
  {
    id: id('business'),
    canonicalName: text('canonical_name').notNull(),
    /** Lowercased, punctuation-stripped. Used for collision detection. */
    nameKey: text('name_key').notNull(),

    country: text('country'),
    region: text('region'),
    industryModuleIds: moduleId('industry_module_ids').array().notNull().default([]),
    maturity: businessMaturity('maturity').notNull().default('unknown'),

    /* ── The canonical domain, as an uncertainty triple ───────────────────
       A directory with a blank website field tells us nothing. Storing a bare
       nullable column here would let "not listed" silently become "has no
       website", which is the exact failure acceptance case 1 exists to catch.
       `..._reason` distinguishes never-searched from searched-and-found-none. */
    canonicalDomainState: factState('canonical_domain_state').notNull().default('unknown'),
    canonicalDomain: text('canonical_domain'),
    canonicalDomainReason: factReason('canonical_domain_reason'),

    dataOrigin: dataOrigin('data_origin').notNull().default('real'),

    firstSeenAt: createdAt(),
    updatedAt: updatedAt(),
    /**
     * A dissolved business keeps its row and its history. Deleting it would
     * lose the aliases that let us recognise its successor.
     */
    dissolvedAt: timestamptz('dissolved_at'),
  },
  (table) => [
    uncertainCheck('canonical_domain'),
    index('business_name_key_idx').on(table.nameKey),
    index('business_origin_idx').on(table.dataOrigin),
    /**
     * One real business per confirmed domain. Partial, because unknown domains
     * are common and legitimately non-unique, and because sample data must be
     * allowed to reuse a domain a real business also holds.
     */
    uniqueIndex('business_domain_unique')
      .on(table.canonicalDomain)
      .where(sql`canonical_domain IS NOT NULL AND data_origin = 'real'`),
  ],
);

export const brand = pgTable(
  'brand',
  {
    id: id('brand'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    status: brandStatus('status').notNull().default('active'),
    retiredAt: timestamptz('retired_at'),
    createdAt: createdAt(),
  },
  (table) => [
    index('brand_business_idx').on(table.businessId),
    index('brand_name_key_idx').on(table.nameKey),
  ],
);

/**
 * Former names, trading names, handles and former domains.
 *
 * Rebrands APPEND here; nothing is overwritten. That is what lets a business
 * found today under a new name be recognised as the one we researched last
 * year, and what stops a destructive merge losing the trail.
 */
export const businessAlias = pgTable(
  'business_alias',
  {
    id: id('businessAlias'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    aliasKey: text('alias_key').notNull(),
    kind: aliasKind('kind').notNull(),
    /** What supports this alias. Set later by the evidence stage. */
    evidenceId: text('evidence_id'),
    observedAt: timestamptz('observed_at'),
    createdAt: createdAt(),
  },
  (table) => [
    index('business_alias_business_idx').on(table.businessId),
    index('business_alias_key_idx').on(table.aliasKey),
  ],
);

export const location = pgTable(
  'location',
  {
    id: id('location'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    label: text('label'),
    countryCode: text('country_code'),
    region: text('region'),
    city: text('city'),
    postalCode: text('postal_code'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index('location_business_idx').on(table.businessId)],
);

/**
 * Ownership and grouping: parents, sub-brands, branches, rosters.
 *
 * Acceptance case 3 rides on this. Without it, five branches of one restaurant
 * group read as five unrelated prospects, and the user sends five near-
 * identical emails to the same head office — which is how a prospecting tool
 * burns its user's reputation.
 */
export const businessRelationship = pgTable(
  'business_relationship',
  {
    id: id('businessRelationship'),
    parentId: text('parent_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    childId: text('child_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    kind: relationshipKind('kind').notNull(),
    confidence: confidence('confidence').notNull().default('medium'),
    evidenceId: text('evidence_id'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('business_relationship_unique').on(table.parentId, table.childId, table.kind),
    index('business_relationship_child_idx').on(table.childId),
  ],
);

/**
 * Two records that might be the same business, or might be two businesses
 * sharing a name.
 *
 * An `open` row blocks campaign eligibility on BOTH sides regardless of score
 * (acceptance case 2). Merging on a name match is the mistake this table
 * exists to prevent: it is cheap to ask the user, and expensive to email the
 * wrong company about their competitor's website.
 */
export const identityConflict = pgTable(
  'identity_conflict',
  {
    id: id('identityConflict'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    otherBusinessId: text('other_business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: conflictStatus('status').notNull().default('open'),
    resolvedByUserId: text('resolved_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamptz('resolved_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('identity_conflict_pair_unique').on(table.businessId, table.otherBusinessId),
    index('identity_conflict_open_idx')
      .on(table.businessId)
      .where(sql`status = 'open'`),
    index('identity_conflict_other_open_idx')
      .on(table.otherBusinessId)
      .where(sql`status = 'open'`),
  ],
);

/**
 * A link found between a candidate website and something that named the
 * business — a directory entry, a social profile, a press mention.
 *
 * Identity resolution leans on these rather than on domain-name similarity:
 * `reciprocal` (the site links back to the source that named it) is far
 * stronger evidence that a domain is official than the name merely matching.
 */
export const businessLink = pgTable(
  'business_link',
  {
    id: id('businessLink'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    fromUrl: text('from_url').notNull(),
    toUrl: text('to_url').notNull(),
    reciprocal: boolean('reciprocal').notNull().default(false),
    sourceRecordId: text('source_record_id'),
    createdAt: createdAt(),
  },
  (table) => [index('business_link_business_idx').on(table.businessId)],
);

export const businessRelations = relations(business, ({ many }) => ({
  brands: many(brand),
  aliases: many(businessAlias),
  locations: many(location),
  links: many(businessLink),
}));

export const brandRelations = relations(brand, ({ one }) => ({
  business: one(business, { fields: [brand.businessId], references: [business.id] }),
}));

export const businessAliasRelations = relations(businessAlias, ({ one }) => ({
  business: one(business, { fields: [businessAlias.businessId], references: [business.id] }),
}));

export const locationRelations = relations(location, ({ one }) => ({
  business: one(business, { fields: [location.businessId], references: [business.id] }),
}));
