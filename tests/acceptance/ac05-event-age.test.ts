import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, createTestDb, type TestDb } from '../setup/pglite';
import { business, event, evidence, sourceRecord } from '@/server/db/schema';
import { describeAge, eventAgeDays, extractPublishedDate, parseDate } from '@/server/evidence/dates';
import { scoreOpportunity } from '@/server/rank/score';

/**
 * ACCEPTANCE CASE 5 — "Old announcement discovered today: preserve its actual
 * event age."
 *
 * The failure mode is quiet and specific: no event date parses, so the code
 * reaches for the one date it definitely has — today — and a 2024 announcement
 * becomes "just announced". The freelancer then congratulates a business on
 * something that happened two years ago.
 *
 * Two columns, never one. And a precision, because "March 2024" is not
 * "11 March 2024" and the UI must not imply that it is.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb(db);
});

describe('reading a date out of a page', () => {
  it('reads a full date at day precision', () => {
    const parsed = parseDate('Our second showroom opened on 14 August 2026.');
    expect(parsed?.precision).toBe('day');
    expect(parsed?.date.toISOString().slice(0, 10)).toBe('2026-08-14');
  });

  it.each([
    ['2024-03-11', 'day', '2024-03-11'],
    ['March 11, 2024', 'day', '2024-03-11'],
    ['11th March 2024', 'day', '2024-03-11'],
  ])('parses %s', (text, precision, iso) => {
    const parsed = parseDate(text);
    expect(parsed?.precision).toBe(precision);
    expect(parsed?.date.toISOString().slice(0, 10)).toBe(iso);
  });

  it('keeps a month-only date at MONTH precision rather than inventing a day', () => {
    const parsed = parseDate('We rebranded in July 2026.');
    expect(parsed?.precision).toBe('month');
    // It stores the 1st internally, but the precision is what the UI reads, so
    // it can never claim the 1st was the actual day.
    expect(parsed?.date.toISOString().slice(0, 7)).toBe('2026-07');
  });

  it('keeps a bare year at YEAR precision', () => {
    const parsed = parseDate('Established 1987.');
    expect(parsed?.precision).toBe('year');
    expect(parsed?.date.getUTCFullYear()).toBe(1987);
  });

  it('refuses an impossible day and degrades to what it does know', () => {
    // `new Date()` would happily turn 31 February into 2 March, and that silent
    // correction is how a confidently wrong date reaches an email.
    //
    // Rather than discarding the string entirely, the parser falls through to
    // the year — which IS legible in "2026-02-31" — and marks the precision
    // accordingly. Knowing the year and saying so beats both a fabricated day
    // and throwing away real information.
    const parsed = parseDate('2026-02-31');

    expect(parsed?.precision).toBe('year');
    expect(parsed?.date.getUTCFullYear()).toBe(2026);
    expect(parsed?.precision).not.toBe('day');
  });

  it('parses no date at all from text that contains none', () => {
    expect(parseDate('We are open Thursday to Saturday.')).toBeNull();
  });

  it('prefers the page’s own markup over prose', () => {
    const html = `
      <time datetime="2024-03-11">a while back</time>
      <p>Join us in 2026 for our anniversary.</p>
    `;
    const parsed = extractPublishedDate(html);
    expect(parsed?.date.toISOString().slice(0, 10)).toBe('2024-03-11');
  });
});

describe('an old announcement discovered today', () => {
  const eventDate = new Date('2024-03-11T00:00:00Z');

  it('stores the event date and the discovery date separately', async () => {
    const [record] = await db
      .insert(sourceRecord)
      .values({
        url: 'https://example.test/news/expansion',
        urlHash: 'hash-ac05',
        contentHash: 'content-ac05',
        httpStatus: 200,
      })
      .returning({ id: sourceRecord.id });

    const [biz] = await db
      .insert(business)
      .values({
        canonicalName: 'Long Ago Ltd',
        nameKey: 'longago',
        canonicalDomainState: 'unknown',
        canonicalDomainReason: 'not_searched',
      })
      .returning({ id: business.id });

    const [claim] = await db
      .insert(evidence)
      .values({
        businessId: biz!.id,
        sourceRecordId: record!.id,
        claimKey: 'expansion_announced',
        classification: 'commercial_hypothesis',
        confidence: 'medium',
        excerpt: 'We opened our second location on 11 March 2024.',
        observedAt: eventDate,
      })
      .returning({ id: evidence.id });

    await db.insert(event).values({
      businessId: biz!.id,
      eventType: 'expansion',
      title: 'Second location opened',
      eventDate,
      eventDatePrecision: 'day',
      evidenceId: claim!.id,
    });

    const [stored] = await db.select().from(event).where(eq(event.businessId, biz!.id));

    expect(stored?.eventDate?.toISOString().slice(0, 10)).toBe('2024-03-11');
    // Discovered today. The two must never be conflated.
    expect(stored?.discoveredAt.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
    expect(stored?.eventDate?.getTime()).not.toBe(stored?.discoveredAt.getTime());
  });

  it('computes age from the EVENT date, not the discovery date', () => {
    const age = eventAgeDays(eventDate);
    // Well over a year, despite having been found moments ago.
    expect(age).toBeGreaterThan(365);
  });

  it('describes it as old, not as news', () => {
    const description = describeAge(eventDate, 'day');
    expect(description).toMatch(/year|months/);
    expect(description).not.toMatch(/today|yesterday/);
  });

  it('returns null for an unknown age rather than defaulting to zero', () => {
    // "0 days old" reads as "brand new". Unknown has to stay unknown.
    expect(eventAgeDays(null)).toBeNull();
    expect(describeAge(null, 'unknown')).toBe('date unknown');
  });

  it('scores an old event as no reason to write now', () => {
    const score = scoreOpportunity({
      matchedClaims: [],
      industryMatches: true,
      regionMatches: true,
      evidenceCount: 2,
      objectiveDefects: 1,
      inconclusive: false,
      latestEvent: { date: eventDate, type: 'expansion' },
      hasVerifiedContact: true,
      hasAnyContact: true,
      identityConfirmed: true,
    });

    const timing = score.components.find((component) => component.component === 'timing');
    expect(timing?.raw).toBe(0);
    expect(timing?.label).toMatch(/past the point/i);
  });

  it('scores a recent event as a genuine reason to write now', () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const score = scoreOpportunity({
      matchedClaims: [],
      industryMatches: true,
      regionMatches: true,
      evidenceCount: 2,
      objectiveDefects: 1,
      inconclusive: false,
      latestEvent: { date: recent, type: 'expansion' },
      hasVerifiedContact: true,
      hasAnyContact: true,
      identityConfirmed: true,
    });

    const timing = score.components.find((component) => component.component === 'timing');
    expect(timing?.raw).toBeGreaterThan(80);
    expect(timing?.label).toMatch(/5 day/);
  });
});
