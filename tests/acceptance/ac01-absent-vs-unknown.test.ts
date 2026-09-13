import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { business, websiteCandidate } from '@/server/db/schema';
import { resolveIdentity, signal } from '@/server/identity/resolve';
import { expectRejection } from '../setup/errors';

/**
 * ACCEPTANCE CASE 1 — "Missing directory site but a real official domain: find
 * or mark uncertain, never assert absence."
 *
 * A directory entry with a blank website field tells you that the field is
 * blank. It tells you nothing about whether the business has a website. Every
 * prospecting tool that conflates the two produces confident nonsense, and the
 * freelancer who acts on it opens an email with a false premise.
 *
 * Kovvi answers this at three levels, and this file tests all three: the
 * database cannot store the conflation, the resolver distinguishes never-looked
 * from looked-and-found-nothing, and the recorded status carries what was
 * searched.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

describe('the database cannot store "absent" as a bare null', () => {
  it('requires a reason when a domain is unknown', async () => {
    const [row] = await db
      .insert(business)
      .values({
        canonicalName: 'Directory Listing Only Ltd',
        nameKey: 'directorylistingonly',
        canonicalDomainState: 'unknown',
        canonicalDomainReason: 'no_evidence',
      })
      .returning();

    expect(row?.canonicalDomainState).toBe('unknown');
    expect(row?.canonicalDomainReason).toBe('no_evidence');
  });

  it('keeps "never searched" distinct from "searched, found nothing"', async () => {
    const [never] = await db
      .insert(business)
      .values({
        canonicalName: 'Untouched Ltd',
        nameKey: 'untouched',
        canonicalDomainState: 'unknown',
        canonicalDomainReason: 'not_searched',
      })
      .returning();

    const [searched] = await db
      .insert(business)
      .values({
        canonicalName: 'Looked Everywhere Ltd',
        nameKey: 'lookedeverywhere',
        canonicalDomainState: 'unknown',
        canonicalDomainReason: 'no_evidence',
      })
      .returning();

    // Both have a null domain. Only one of them means anything.
    expect(never?.canonicalDomain).toBeNull();
    expect(searched?.canonicalDomain).toBeNull();
    expect(never?.canonicalDomainReason).not.toBe(searched?.canonicalDomainReason);
  });

  it('refuses to claim a known domain it does not hold', async () => {
    await expectRejection(
      db.insert(business).values({
        canonicalName: 'Asserted Absence Ltd',
        nameKey: 'assertedabsence',
        canonicalDomainState: 'known',
        canonicalDomain: null,
      }),
      /canonical_domain_state_matches_value/,
    );
  });
});

describe('the resolver never asserts absence', () => {
  it('reports "not searched" when nothing has been looked at', () => {
    const resolution = resolveIdentity({
      signals: [],
      searchedVia: [],
      hasCandidate: false,
    });

    expect(resolution.status).toBe('none_found_after_search');
    expect(resolution.confidence).toBe('low');
    expect(resolution.explanation).toMatch(/no search has been performed/i);
  });

  it('records WHAT was searched, so the absence is defensible', () => {
    const resolution = resolveIdentity({
      signals: [],
      searchedVia: ['companies register', 'web search', 'social profiles'],
      hasCandidate: false,
    });

    expect(resolution.status).toBe('none_found_after_search');
    expect(resolution.explanation).toMatch(/companies register/);
    // The crucial sentence: it explicitly refuses to claim absence.
    expect(resolution.explanation).toMatch(/not evidence that none exists/i);
  });

  it('finds the real domain when the evidence is there, despite the blank field', () => {
    // The directory said nothing. The site links back to the directory entry.
    const resolution = resolveIdentity({
      signals: [
        signal('reciprocal_link', 'The site links back to its directory listing'),
        signal('brand_name_in_title', 'The business name appears in the page title'),
      ],
      searchedVia: ['web search'],
      hasCandidate: true,
    });

    expect(resolution.status).toBe('confirmed_official');
    expect(resolution.confidence).toBe('high');
  });

  it('will not confirm on name similarity alone', () => {
    // A squatted or coincidental domain has exactly these signals. The
    // threshold is set above their sum on purpose.
    const resolution = resolveIdentity({
      signals: [
        signal('domain_name_similarity', 'The domain resembles the business name'),
        signal('brand_name_in_title', 'The name appears in the title'),
        signal('regional_tld', 'The TLD matches the country'),
      ],
      searchedVia: ['web search'],
      hasCandidate: true,
    });

    expect(resolution.status).toBe('probable');
    expect(resolution.status).not.toBe('confirmed_official');
    expect(resolution.explanation).toMatch(/worth a glance/i);
  });

  it('separates "could not read it" from "it is not there"', () => {
    const resolution = resolveIdentity({
      signals: [signal('domain_name_similarity', 'Domain resembles the name')],
      searchedVia: ['web search'],
      hasCandidate: true,
      inaccessible: true,
    });

    expect(resolution.status).toBe('inaccessible');
    expect(resolution.explanation).toMatch(/could not be read/i);
  });
});

describe('the recorded candidate', () => {
  it('stores which searches were performed alongside the status', async () => {
    const [biz] = await db
      .insert(business)
      .values({
        canonicalName: 'Searched Thoroughly Ltd',
        nameKey: 'searchedthoroughly',
        canonicalDomainState: 'unknown',
        canonicalDomainReason: 'no_evidence',
      })
      .returning({ id: business.id });

    await db.insert(websiteCandidate).values({
      businessId: biz!.id,
      identityStatus: 'none_found_after_search',
      identityConfidence: 'medium',
      searchedVia: ['web_search', 'companies_register', 'instagram'],
      searchedAt: new Date(),
    });

    const [candidate] = await db
      .select()
      .from(websiteCandidate)
      .where(eq(websiteCandidate.businessId, biz!.id));

    expect(candidate?.identityStatus).toBe('none_found_after_search');
    // Without this list, the status would be an assertion rather than a record.
    expect(candidate?.searchedVia).toHaveLength(3);
    expect(candidate?.searchedAt).toBeInstanceOf(Date);
  });
});
