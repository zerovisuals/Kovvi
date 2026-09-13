import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { business, businessRelationship, contact, sourceRecord } from '@/server/db/schema';

/**
 * ACCEPTANCE CASE 3 — "One parent with multiple branches, brands or rosters:
 * shared ownership context and appropriate business contact deduplication."
 *
 * Five branches of one restaurant group are not five prospects. Treated as
 * five, the freelancer sends five near-identical emails to the same head-office
 * inbox — which is how a prospecting tool turns its user into spam.
 *
 * Two mechanisms: relationships record the shared ownership, and the unique
 * index on (business, channel, value hash) collapses the repeated head-office
 * address to one contact per business.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

function hash(value: string): string {
  return createHash('sha256').update(value.toLowerCase()).digest('hex');
}

async function makeBusiness(name: string): Promise<string> {
  const [row] = await db
    .insert(business)
    .values({
      canonicalName: name,
      nameKey: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      canonicalDomainState: 'unknown',
      canonicalDomainReason: 'not_searched',
    })
    .returning({ id: business.id });

  return row!.id;
}

describe('a group with several branches', () => {
  it('records the ownership relationship rather than inferring it later', async () => {
    const parent = await makeBusiness('Ardent Group');
    const branches = await Promise.all([
      makeBusiness('Ardent Kitchen Shoreditch'),
      makeBusiness('Ardent Kitchen Peckham'),
      makeBusiness('Ardent Kitchen Leeds'),
    ]);

    for (const child of branches) {
      await db.insert(businessRelationship).values({
        parentId: parent,
        childId: child,
        kind: 'branch_of',
        confidence: 'high',
      });
    }

    const recorded = await db
      .select()
      .from(businessRelationship)
      .where(eq(businessRelationship.parentId, parent));

    expect(recorded).toHaveLength(3);
    expect(recorded.every((row) => row.kind === 'branch_of')).toBe(true);
  });

  it('will not record the same relationship twice', async () => {
    const parent = await makeBusiness('Repeat Holdings');
    const child = await makeBusiness('Repeat Branch');

    await db.insert(businessRelationship).values({
      parentId: parent,
      childId: child,
      kind: 'branch_of',
    });

    // Discovering the same structure on a second run must not duplicate it.
    await db
      .insert(businessRelationship)
      .values({ parentId: parent, childId: child, kind: 'branch_of' })
      .onConflictDoNothing();

    const rows = await db
      .select()
      .from(businessRelationship)
      .where(eq(businessRelationship.parentId, parent));

    expect(rows).toHaveLength(1);
  });

  it('supports sub-brands and rosters, not only branches', async () => {
    const parent = await makeBusiness('Vantage Holdings');
    const brand = await makeBusiness('Vantage Apparel');
    const roster = await makeBusiness('Vantage Esports');

    await db.insert(businessRelationship).values([
      { parentId: parent, childId: brand, kind: 'brand_of' },
      { parentId: parent, childId: roster, kind: 'roster_of' },
    ]);

    const rows = await db
      .select()
      .from(businessRelationship)
      .where(eq(businessRelationship.parentId, parent));

    expect(rows.map((row) => row.kind).sort()).toEqual(['brand_of', 'roster_of']);
  });
});

describe('the shared head-office address', () => {
  it('is stored once per business, however many pages list it', async () => {
    const branch = await makeBusiness('Ardent Kitchen Bristol');

    const [record] = await db
      .insert(sourceRecord)
      .values({
        url: 'https://ardent.test/bristol',
        urlHash: 'hash-ardent-bristol',
        contentHash: 'content-ardent-bristol',
        httpStatus: 200,
      })
      .returning({ id: sourceRecord.id });

    const address = 'hello@ardentgroup.test';

    // The same address appears on the contact page, the footer and the
    // careers page — three retrievals of one fact.
    for (let occurrence = 0; occurrence < 3; occurrence += 1) {
      await db
        .insert(contact)
        .values({
          businessId: branch,
          channel: 'email',
          value: address,
          valueHash: hash(address),
          sourceRecordId: record!.id,
        })
        .onConflictDoNothing();
    }

    const contacts = await db.select().from(contact).where(eq(contact.businessId, branch));
    expect(contacts).toHaveLength(1);
  });

  it('is deduplicated by a normalised hash, not by exact spelling', async () => {
    const branch = await makeBusiness('Ardent Kitchen Cardiff');

    const [record] = await db
      .insert(sourceRecord)
      .values({
        url: 'https://ardent.test/cardiff',
        urlHash: 'hash-ardent-cardiff',
        contentHash: 'content-ardent-cardiff',
        httpStatus: 200,
      })
      .returning({ id: sourceRecord.id });

    for (const spelling of ['Hello@ArdentGroup.test', 'hello@ardentgroup.test', 'HELLO@ARDENTGROUP.TEST']) {
      await db
        .insert(contact)
        .values({
          businessId: branch,
          channel: 'email',
          value: spelling,
          valueHash: hash(spelling),
          sourceRecordId: record!.id,
        })
        .onConflictDoNothing();
    }

    const contacts = await db.select().from(contact).where(eq(contact.businessId, branch));
    expect(contacts).toHaveLength(1);
  });

  it('keeps genuinely different addresses apart', async () => {
    // The control: dedupe must not be so eager that a branch manager's own
    // address is swallowed by the head-office one.
    const branch = await makeBusiness('Ardent Kitchen Glasgow');

    const [record] = await db
      .insert(sourceRecord)
      .values({
        url: 'https://ardent.test/glasgow',
        urlHash: 'hash-ardent-glasgow',
        contentHash: 'content-ardent-glasgow',
        httpStatus: 200,
      })
      .returning({ id: sourceRecord.id });

    for (const address of ['hello@ardentgroup.test', 'glasgow@ardentgroup.test']) {
      await db.insert(contact).values({
        businessId: branch,
        channel: 'email',
        value: address,
        valueHash: hash(address),
        sourceRecordId: record!.id,
      });
    }

    const contacts = await db.select().from(contact).where(eq(contact.businessId, branch));
    expect(contacts).toHaveLength(2);
  });
});
