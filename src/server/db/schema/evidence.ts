import { relations } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  claimClass,
  confidence,
  dataOrigin,
  datePrecision,
  eventType,
  evidenceOrigin,
  trustLevel,
} from './enums';
import { createdAt, id, timestamptz } from './columns';
import { business } from './identity';

/**
 * THE EVIDENCE CORE
 *
 * Everything Kovvi claims about a business traces back through these three
 * tables to a document that was actually retrieved. The chain is:
 *
 *     sourceRecord   a real HTTP retrieval — URL, status, content hash, time
 *          ↑
 *     evidence       one claim, with the excerpt that supports it
 *          ↑
 *     event          a dated commercial happening, built on that evidence
 *
 * Two rules are enforced structurally rather than by convention:
 *
 *  1. `evidence.sourceRecordId` is NOT NULL. A claim with no retrieval behind
 *     it cannot be stored.
 *  2. `evidenceOrigin` has no `'llm'` value. A model's summary can never
 *     become its own evidence — there is nowhere to put it.
 */

export const sourceRecord = pgTable(
  'source_record',
  {
    id: id('sourceRecord'),

    /** Which adapter retrieved this. Null for user-supplied imports. */
    adapterId: text('adapter_id'),

    url: text('url').notNull(),
    /** SHA-256 of the normalised URL. Indexed for dedupe. */
    urlHash: text('url_hash').notNull(),

    httpStatus: integer('http_status'),
    /** After redirects. Differs from `url` when the site moved. */
    finalUrl: text('final_url'),
    /** Every hop, each revalidated against the SSRF policy. */
    redirectChain: jsonb('redirect_chain').$type<string[]>().notNull().default([]),

    contentType: text('content_type'),
    contentHash: text('content_hash'),
    byteLength: integer('byte_length'),
    /** Points at the stored body in blob storage, when one was kept. */
    blobRef: text('blob_ref'),

    /**
     * When WE fetched it. Distinct from when the content was published, which
     * lives on `evidence`/`event` because a single page can carry claims of
     * very different ages.
     */
    retrievedAt: timestamptz('retrieved_at').notNull().defaultNow(),

    /**
     * Anything off the public web is untrusted input, including instructions
     * embedded in it. This drives the wrapping applied before content is ever
     * shown to a model.
     */
    trustLevel: trustLevel('trust_level').notNull().default('untrusted_web'),

    /**
     * Set when the page contained text attempting to instruct an automated
     * reader. The instruction is ignored, extraction continues, and the
     * opportunity detail shows the user that it happened — acceptance case 6.
     */
    injectionFlagged: boolean('injection_flagged').notNull().default(false),
    injectionDetail: text('injection_detail'),

    dataOrigin: dataOrigin('data_origin').notNull().default('real'),
    createdAt: createdAt(),
  },
  (table) => [
    /** The same bytes from the same URL is one record, however often seen. */
    uniqueIndex('source_record_url_content_unique').on(table.urlHash, table.contentHash),
    index('source_record_retrieved_idx').on(table.retrievedAt),
    index('source_record_url_idx').on(table.urlHash),
  ],
);

export const evidence = pgTable(
  'evidence',
  {
    id: id('evidence'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    /**
     * NOT NULL, deliberately. Every claim points at a real retrieval. This one
     * constraint is what separates evidence from assertion.
     */
    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecord.id, { onDelete: 'restrict' }),

    claimKey: text('claim_key').notNull(),
    claimValue: jsonb('claim_value').$type<unknown>(),

    /** The supporting quote, plus where to find it in the source. */
    excerpt: text('excerpt'),
    excerptStart: integer('excerpt_start'),
    excerptEnd: integer('excerpt_end'),

    /**
     * An objective defect, a subjective observation, and a commercial
     * hypothesis are three different kinds of statement. Presenting the third
     * as the first is this category's characteristic dishonesty, so they are
     * stored — and displayed — apart.
     */
    classification: claimClass('classification').notNull(),
    confidence: confidence('confidence').notNull().default('medium'),

    /** See enums.ts: there is no `'llm'`, and that is the point. */
    origin: evidenceOrigin('origin').notNull().default('extractor'),
    extractorVersion: text('extractor_version'),

    /** When the claim was true of the world, per the source. */
    observedAt: timestamptz('observed_at'),
    /**
     * After this, the claim is stale and campaigns citing it are blocked until
     * it is refreshed — acceptance case 11. Outreach quoting a six-month-old
     * "you just launched" is worse than no outreach.
     */
    expiresAt: timestamptz('expires_at'),

    /** Newer evidence replaces older without deleting the trail. */
    supersededById: text('superseded_by_id'),

    dataOrigin: dataOrigin('data_origin').notNull().default('real'),
    createdAt: createdAt(),
  },
  (table) => [
    index('evidence_business_idx').on(table.businessId, table.observedAt),
    index('evidence_source_idx').on(table.sourceRecordId),
    index('evidence_claim_idx').on(table.businessId, table.claimKey),
    index('evidence_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * A dated commercial happening: a collection launch, an opening, a rebrand.
 * This is the "why now" that makes an approach relevant rather than random.
 *
 * `eventDate` and `discoveredAt` are separate columns and always will be. An
 * announcement from 2024 found today is two years old, not new, and the UI
 * shows the event's age — acceptance case 5. Conflating them is how a
 * prospecting tool ends up congratulating someone on an anniversary they
 * celebrated eighteen months ago.
 */
export const event = pgTable(
  'event',
  {
    id: id('event'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    eventType: eventType('event_type').notNull(),
    title: text('title'),

    eventDate: timestamptz('event_date'),
    /** "March 2024" is not "11 March 2024"; the UI must not imply otherwise. */
    eventDatePrecision: datePrecision('event_date_precision').notNull().default('unknown'),

    /** When Kovvi first saw it — never used to compute the event's age. */
    discoveredAt: timestamptz('discovered_at').notNull().defaultNow(),

    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),

    dataOrigin: dataOrigin('data_origin').notNull().default('real'),
    createdAt: createdAt(),
  },
  (table) => [
    index('event_business_idx').on(table.businessId, table.eventDate),
    index('event_type_idx').on(table.eventType),
    index('event_evidence_idx').on(table.evidenceId),
  ],
);

export const sourceRecordRelations = relations(sourceRecord, ({ many }) => ({
  evidence: many(evidence),
}));

export const evidenceRelations = relations(evidence, ({ many, one }) => ({
  business: one(business, { fields: [evidence.businessId], references: [business.id] }),
  source: one(sourceRecord, {
    fields: [evidence.sourceRecordId],
    references: [sourceRecord.id],
  }),
  events: many(event),
}));

export const eventRelations = relations(event, ({ one }) => ({
  business: one(business, { fields: [event.businessId], references: [business.id] }),
  evidence: one(evidence, { fields: [event.evidenceId], references: [evidence.id] }),
}));
