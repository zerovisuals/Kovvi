import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { expectRejection } from '../setup/errors';
import { business, evidence, message, sourceRecord } from '@/server/db/schema';

/**
 * The honesty rules, tested as database behaviour.
 *
 * These are the constraints the whole product rests on. The point of this file
 * is that they hold even when the application code is wrong — a bug, a new
 * contributor, or a future refactor cannot write a dishonest row, because the
 * database will not accept one.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

describe('a NULL never means "absent"', () => {
  it('accepts "we searched and found nothing", recording why', async () => {
    const [row] = await db
      .insert(business)
      .values({
        canonicalName: 'Nothing Found Ltd',
        nameKey: 'nothingfoundltd',
        canonicalDomainState: 'unknown',
        canonicalDomainReason: 'no_evidence',
      })
      .returning();

    expect(row?.canonicalDomain).toBeNull();
    expect(row?.canonicalDomainState).toBe('unknown');
    // The distinction that matters: this is not the same as never having looked.
    expect(row?.canonicalDomainReason).toBe('no_evidence');
  });

  it('accepts "we never looked", and says so distinctly', async () => {
    const [row] = await db
      .insert(business)
      .values({
        canonicalName: 'Never Searched Ltd',
        nameKey: 'neversearchedltd',
        canonicalDomainState: 'unknown',
        canonicalDomainReason: 'not_searched',
      })
      .returning();

    expect(row?.canonicalDomainReason).toBe('not_searched');
  });

  it('accepts a known domain', async () => {
    const [row] = await db
      .insert(business)
      .values({
        canonicalName: 'Known Co',
        nameKey: 'knownco',
        canonicalDomainState: 'known',
        canonicalDomain: 'known.example',
      })
      .returning();

    expect(row?.canonicalDomain).toBe('known.example');
  });

  it('REFUSES a row claiming to know a domain it does not have', async () => {
    await expectRejection(
      db.insert(business).values({
        canonicalName: 'Liar Co',
        nameKey: 'liarco',
        canonicalDomainState: 'known',
        canonicalDomain: null,
      }),
      /canonical_domain_state_matches_value/,
    );
  });

  it('REFUSES a row holding a domain while claiming not to know one', async () => {
    // The subtler direction: data present but the state says unknown. Allowing
    // it would let a stale value linger behind an "unknown" badge.
    await expectRejection(
      db.insert(business).values({
        canonicalName: 'Contradiction Co',
        nameKey: 'contradictionco',
        canonicalDomainState: 'unknown',
        canonicalDomain: 'contradiction.example',
      }),
      /canonical_domain_state_matches_value/,
    );
  });
});

describe('an LLM summary cannot become its own evidence', () => {
  it('has no origin value a model could be recorded under', () => {
    // Enforced by the enum's shape, so there is no row to reject: there is
    // simply nowhere to put a model-authored claim.
    expect(evidence.origin.enumValues).toEqual(['extractor', 'adapter', 'user']);
    expect(evidence.origin.enumValues).not.toContain('llm');
  });

  it('refuses a claim with no retrieval behind it', async () => {
    // Two layers, and both matter. TypeScript rejects this at compile time —
    // `sourceRecordId` is not optional — so the cast below is what a bug or a
    // raw query would look like. The database refuses it regardless, which is
    // the guarantee that survives a mistake in the application code.
    const ungrounded = {
      businessId: 'biz_does_not_matter',
      sourceRecordId: null,
      claimKey: 'made_up',
      classification: 'objective_defect',
    } as unknown as typeof evidence.$inferInsert;

    await expectRejection(
      db.insert(evidence).values(ungrounded),
      /source_record_id|not-null|violates/i,
    );
  });
});

describe('an ungrounded draft cannot exist', () => {
  it('refuses a message citing no evidence', async () => {
    await expectRejection(
      db.insert(message).values({
        workspaceId: 'wsp_x',
        campaignId: 'cmp_x',
        opportunityId: 'opp_x',
        body: 'I noticed your website could use some work!',
        bodyHash: 'deadbeef',
        groundingEvidenceIds: [],
      }),
      /message_must_be_grounded|violates/i,
    );
  });
});

describe('the same retrieval is stored once', () => {
  it('rejects a duplicate url+content pair', async () => {
    const values = {
      url: 'https://example.test/about',
      urlHash: 'hash-of-url',
      contentHash: 'hash-of-content',
      httpStatus: 200,
    };

    await db.insert(sourceRecord).values(values);
    await expectRejection(
      db.insert(sourceRecord).values(values),
      /source_record_url_content_unique/,
    );
  });
});
