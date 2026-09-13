import { sql } from 'drizzle-orm';
import { check, text, timestamp } from 'drizzle-orm/pg-core';
import { idFor, type ID_PREFIXES } from '../ids';

/**
 * Column shapes used across the schema, defined once so they cannot drift.
 */

/** Prefixed primary key, e.g. `biz_k3x9…`. */
export function id(kind: keyof typeof ID_PREFIXES) {
  return text('id').primaryKey().$defaultFn(idFor(kind));
}

/**
 * `timestamptz` throughout. This product reasons about dates across regions
 * constantly — event dates, retrieval times, freshness windows — and a naive
 * timestamp would silently misreport all of them.
 */
export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'date' });
}

export const createdAt = () => timestamptz('created_at').notNull().defaultNow();
export const updatedAt = () => timestamptz('updated_at').notNull().defaultNow();

/**
 * THE UNCERTAINTY TRIPLE
 *
 * Any fact that can be unknown is stored as three columns rather than one
 * nullable one:
 *
 *   <fact>_state    known | unknown | conflicting
 *   <fact>          the value — meaningful ONLY when state = 'known'
 *   <fact>_reason   not_searched | search_failed | blocked | no_evidence | ambiguous
 *
 * The columns are written out explicitly at each use site (Drizzle infers types
 * from literal column definitions, and a generic helper would erase them), but
 * every one of them pairs with this CHECK, which is what makes the pattern
 * trustworthy rather than merely conventional: a value exists if and only if
 * the state says it is known.
 *
 * The consequence is that a NULL can never mean "we established there is
 * none". That distinction — never searched, versus searched and found nothing,
 * versus found conflicting answers — is acceptance case 1, and it is the
 * difference between evidence and guesswork.
 */
export function uncertainCheck(columnName: string) {
  return check(
    `${columnName}_state_matches_value`,
    sql.raw(`((${columnName}_state = 'known') = (${columnName} IS NOT NULL))`),
  );
}

/**
 * Where in a source a claim was found. Stored as offsets plus the quoted text,
 * so the UI can show the excerpt without re-fetching and a reviewer can locate
 * it in the original.
 */
export const excerptColumns = {
  excerpt: text('excerpt'),
  excerptStart: text('excerpt_start'),
  excerptEnd: text('excerpt_end'),
};
