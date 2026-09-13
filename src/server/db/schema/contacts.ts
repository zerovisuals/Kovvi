import { relations } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { contactChannel, contactVerification, dataOrigin } from './enums';
import { createdAt, id, timestamptz } from './columns';
import { business } from './identity';
import { sourceRecord } from './evidence';

/**
 * Publicly listed ways to reach a business.
 *
 * Note what this table cannot express. There is no "inferred owner" column and
 * no free-text guess field, so a nickname on a Discord server cannot quietly
 * become an ownership claim: anything asserting a person's role has to go
 * through `evidence` with a real source behind it.
 *
 * `sourceRecordId` is NOT NULL for the same reason it is on evidence — an
 * address nobody can point at the origin of is an invented address.
 */
export const contact = pgTable(
  'contact',
  {
    id: id('contact'),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    /** As publicly listed. Null when the page gave a channel but no role. */
    role: text('role'),
    /** What supports the role claim, when there is one. */
    roleEvidenceId: text('role_evidence_id'),

    channel: contactChannel('channel').notNull(),
    value: text('value').notNull(),
    /** SHA-256 of the normalised value: dedupe and suppression matching. */
    valueHash: text('value_hash').notNull(),

    /**
     * A public listing is `probable` at best. `verified` requires corroboration
     * from a second source — it is never an assumption about format.
     */
    verification: contactVerification('verification').notNull().default('unverified'),

    sourceRecordId: text('source_record_id')
      .notNull()
      .references(() => sourceRecord.id, { onDelete: 'restrict' }),

    /** Contact details rot. The UI shows this age next to the address. */
    lastCheckedAt: timestamptz('last_checked_at').notNull().defaultNow(),

    dataOrigin: dataOrigin('data_origin').notNull().default('real'),
    createdAt: createdAt(),
  },
  (table) => [
    /**
     * One row per business per channel per address. This is also what
     * de-duplicates a head-office address that appears on every branch page
     * (acceptance case 3) — the user contacts the group once, not five times.
     */
    uniqueIndex('contact_unique').on(table.businessId, table.channel, table.valueHash),
    index('contact_business_idx').on(table.businessId),
    index('contact_value_hash_idx').on(table.valueHash),
  ],
);

export const contactRelations = relations(contact, ({ one }) => ({
  business: one(business, { fields: [contact.businessId], references: [business.id] }),
  source: one(sourceRecord, {
    fields: [contact.sourceRecordId],
    references: [sourceRecord.id],
  }),
}));
