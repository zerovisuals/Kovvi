/**
 * The complete schema, re-exported for Drizzle.
 *
 * One file per aggregate. Four carry the product's honesty guarantees
 * structurally, and are worth reading before changing anything here:
 *
 *   enums.ts     — where `evidence_origin` has no 'llm' value, on purpose
 *   identity.ts  — the uncertainty triple, so a NULL never means "absent"
 *   evidence.ts  — every claim NOT NULL-referenced to a real retrieval
 *   outreach.ts  — a draft that cites no evidence cannot be stored
 *
 * Tenancy: tables carrying `workspaceId` are private and reached through
 * `withTenant`. The identity, evidence and web tables are deliberately global —
 * public facts about a business are the same for everyone, and resolving them
 * once is what stops two users paying twice for the same work.
 */
export * from './enums';
export * from './columns';
export * from './tenancy';
export * from './profile';
export * from './identity';
export * from './modules';
export * from './evidence';
export * from './web';
export * from './contacts';
export * from './opportunity';
export * from './runs';
export * from './outreach';
export * from './ops';
