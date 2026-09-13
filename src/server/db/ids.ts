import { customAlphabet } from 'nanoid';

/**
 * Prefixed, URL-safe identifiers.
 *
 * Type-prefixed ids make logs, CSV exports and support conversations readable
 * without a lookup, and make it obvious when an id of the wrong type has been
 * passed somewhere.
 *
 * Sample-ness deliberately does NOT appear in the id. `data_origin` on the row
 * is the single source of truth for that; encoding it twice invites the two to
 * disagree, and a row's origin can be corrected while its id cannot.
 */

// Lowercase alphanumerics only: unambiguous when read aloud or hand-copied,
// and safe in URLs, filenames and blob keys without escaping.
const generate = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 20);

export const ID_PREFIXES = {
  workspace: 'wsp',
  user: 'usr',
  session: 'ses',
  serviceProfile: 'svc',
  portfolioProject: 'prj',
  profileClaim: 'clm',
  business: 'biz',
  brand: 'brd',
  businessAlias: 'als',
  location: 'loc',
  businessRelationship: 'rel',
  identityConflict: 'cfl',
  businessLink: 'lnk',
  sourceAdapter: 'adp',
  assessmentRule: 'rul',
  benchmarkCase: 'bmk',
  sourceRecord: 'src',
  evidence: 'evd',
  event: 'evt',
  websiteCandidate: 'web',
  assessment: 'asm',
  finding: 'fnd',
  capture: 'cap',
  contact: 'ctc',
  opportunity: 'opp',
  moduleHit: 'hit',
  scoreInput: 'sci',
  researchRun: 'run',
  job: 'job',
  providerCall: 'pcl',
  savedSearch: 'sch',
  campaign: 'cmp',
  message: 'msg',
  approval: 'apr',
  sendAttempt: 'snd',
  followUp: 'fup',
  conversation: 'cnv',
  conversationMessage: 'cmg',
  outcome: 'out',
  suppression: 'sup',
  usageLedger: 'lgr',
  subscription: 'sub',
  auditEvent: 'aud',
  blobObject: 'blb',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

/** `newId('business')` → `biz_k3x9...`. */
export function newId(kind: keyof typeof ID_PREFIXES): string {
  return `${ID_PREFIXES[kind]}_${generate()}`;
}

/** Curried for use as a Drizzle `$defaultFn`. */
export function idFor(kind: keyof typeof ID_PREFIXES): () => string {
  return () => newId(kind);
}

/** True when `id` carries the prefix for `kind`. Used at trust boundaries. */
export function isIdOf(kind: keyof typeof ID_PREFIXES, id: string): boolean {
  return id.startsWith(`${ID_PREFIXES[kind]}_`);
}
