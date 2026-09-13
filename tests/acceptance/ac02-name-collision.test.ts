import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { business, identityConflict } from '@/server/db/schema';
import { compareBusinesses, nameKey } from '@/server/identity/resolve';
import { campaignEligibility } from '@/server/rank/eligibility';

/**
 * ACCEPTANCE CASE 2 — "Two organizations with the same name: prevent silent
 * merge and sending until resolved."
 *
 * Merging is unrecoverable, and the consequence of getting it wrong is not an
 * ugly row in a table — it is an email to a coffee roaster about a marine
 * engineering firm's website, sent under the freelancer's own name.
 *
 * So the rule is absolute: an open conflict blocks outreach regardless of how
 * well the opportunity scores.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

const bristol = {
  name: 'Harbour & Co',
  domain: 'harbourco-bristol.test',
  country: 'GB',
  region: 'Bristol',
};

const aberdeen = {
  name: 'Harbour and Co.',
  domain: 'harbourco-marine.test',
  country: 'GB',
  region: 'Aberdeen',
};

describe('two businesses sharing a name', () => {
  it('normalises to the same key, which is what makes the collision visible', () => {
    // Suffixes and punctuation differ; the underlying name does not. A tool
    // that compared raw strings would never notice these two collide.
    expect(nameKey(bristol.name)).toBe(nameKey(aberdeen.name));
  });

  it('is reported as a conflict, never silently merged', () => {
    const verdict = compareBusinesses(bristol, aberdeen);

    expect(verdict.kind).toBe('conflict');
    expect(verdict.reason).toMatch(/different websites/i);
  });

  it('treats a shared confirmed domain as genuinely the same business', () => {
    const verdict = compareBusinesses(bristol, { ...aberdeen, domain: bristol.domain });
    expect(verdict.kind).toBe('same');
  });

  it('treats different names as distinct without ceremony', () => {
    const verdict = compareBusinesses(bristol, { ...aberdeen, name: 'Completely Different Ltd' });
    expect(verdict.kind).toBe('distinct');
  });

  it('conflicts on a same-name, same-region pair rather than guessing either way', () => {
    // The genuinely ambiguous case: it might be one business with two listings
    // or two businesses on one street. Both guesses are wrong often enough that
    // asking is the only defensible answer.
    const verdict = compareBusinesses(
      { name: 'Harbour & Co', region: 'Bristol', country: 'GB' },
      { name: 'Harbour and Co', region: 'Bristol', country: 'GB' },
    );
    expect(verdict.kind).toBe('conflict');
  });
});

describe('an open conflict blocks outreach', () => {
  it('records the conflict against both businesses', async () => {
    const [a] = await db
      .insert(business)
      .values({
        canonicalName: bristol.name,
        nameKey: nameKey(bristol.name),
        region: bristol.region,
        canonicalDomainState: 'known',
        canonicalDomain: bristol.domain,
      })
      .returning({ id: business.id });

    const [b] = await db
      .insert(business)
      .values({
        canonicalName: aberdeen.name,
        nameKey: nameKey(aberdeen.name),
        region: aberdeen.region,
        canonicalDomainState: 'known',
        canonicalDomain: aberdeen.domain,
      })
      .returning({ id: business.id });

    await db.insert(identityConflict).values({
      businessId: a!.id,
      otherBusinessId: b!.id,
      reason: compareBusinesses(bristol, aberdeen).reason,
      status: 'open',
    });

    const open = await db
      .select()
      .from(identityConflict)
      .where(and(eq(identityConflict.businessId, a!.id), eq(identityConflict.status, 'open')));

    expect(open).toHaveLength(1);
    expect(open[0]?.reason).toMatch(/Harbour/);
  });

  it('blocks a HIGH-scoring opportunity while the conflict is open', () => {
    const eligibility = campaignEligibility({
      identityConflictOpen: true,
      hasContact: true,
      evidenceExpired: false,
      suppressed: false,
      subscriptionActive: true,
      isSampleWorkspace: false,
      totalScore: 98,
    });

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockedReason).toBe('identity_conflict');
    // Score is irrelevant. That is the point of the rule.
    expect(eligibility.explanation).toMatch(/cannot reliably tell/i);
  });

  it('allows outreach once a human has resolved it', async () => {
    const eligibility = campaignEligibility({
      identityConflictOpen: false,
      hasContact: true,
      evidenceExpired: false,
      suppressed: false,
      subscriptionActive: true,
      isSampleWorkspace: false,
      totalScore: 40,
    });

    expect(eligibility.eligible).toBe(true);
    expect(eligibility.blockedReason).toBeNull();
  });

  it('keeps both businesses; resolving never deletes one', async () => {
    const rows = await db.select().from(business);
    const harbours = rows.filter((row) => row.nameKey === nameKey(bristol.name));

    // Two rows, two histories. A merge would have destroyed the evidence trail
    // of whichever one lost.
    expect(harbours.length).toBeGreaterThanOrEqual(2);
  });
});
