import { describe, expect, it } from 'vitest';
import { draftFromTemplate, UngroundedDraftError } from '@/server/draft/template';

/**
 * What a draft is allowed to SAY.
 *
 * The grounding rules are tested in ac11: a message must cite evidence, and an
 * expired claim may not be cited. These are the rules that stop a technically
 * grounded message from still reading as a scrape — each one was written after
 * reading real output from the seeded pipeline and finding it embarrassing.
 */

const base = {
  businessName: 'Harbour and Co',
  senderName: 'Alex',
  senderService: 'ecommerce redesign',
  portfolio: null,
};

function recent(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 86_400_000);
}

describe('an event as a reason to write', () => {
  it('opens with one that is genuinely recent', () => {
    const draft = draftFromTemplate({
      ...base,
      event: {
        evidenceId: 'evd_event',
        title: 'launched an autumn collection',
        date: recent(11),
        precision: 'day',
        expired: false,
        type: 'collection_launch',
      },
      findings: [],
    });

    expect(draft.body).toMatch(/launched an autumn collection/);
    expect(draft.groundingEvidenceIds).toContain('evd_event');
    expect(draft.subject).toMatch(/Harbour and Co/);
  });

  it('refuses one older than its freshness window, even with fresh evidence', () => {
    // The page was retrieved this morning, so the evidence row is not expired.
    // The EVENT is from 1987. A product that treats page freshness as event
    // freshness will cheerfully open a cold email with something that happened
    // before the recipient was born.
    expect(() =>
      draftFromTemplate({
        ...base,
        event: {
          evidenceId: 'evd_event',
          title: 'was established',
          date: new Date('1987-01-01'),
          precision: 'year',
          expired: false,
          type: 'opening',
        },
        findings: [],
      }),
    ).toThrow(UngroundedDraftError);
  });

  it('says in its omissions why the old event was dropped', () => {
    const draft = draftFromTemplate({
      ...base,
      event: {
        evidenceId: 'evd_event',
        title: 'was established',
        date: new Date('1987-01-01'),
        precision: 'year',
        expired: false,
        type: 'opening',
      },
      findings: [
        {
          id: 'evd_finding',
          classification: 'objective_defect',
          summary: 'The product pages carry no size information on mobile.',
          expired: false,
        },
      ],
    });

    expect(draft.omissions.join(' ')).toMatch(/too old to be a reason for writing now/i);
    expect(draft.body).not.toMatch(/1987|established/i);
    // And the subject drops its specificity along with the reason for it.
    expect(draft.subject).not.toMatch(/Harbour and Co/);
  });

  it('treats different event types by their own window', () => {
    // 70 days: stale for a collection launch (60), current for an opening (120).
    const stale = draftFromTemplate({
      ...base,
      event: {
        evidenceId: 'evd_a',
        title: 'launched a collection',
        date: recent(70),
        precision: 'day',
        expired: false,
        type: 'collection_launch',
      },
      findings: [
        { id: 'evd_f', classification: 'objective_defect', summary: 'The checkout has no visible delivery cost.', expired: false },
      ],
    });

    const current = draftFromTemplate({
      ...base,
      event: {
        evidenceId: 'evd_b',
        title: 'opened a second location',
        date: recent(70),
        precision: 'day',
        expired: false,
        type: 'opening',
      },
      findings: [],
    });

    expect(stale.body).not.toMatch(/launched a collection/);
    expect(current.body).toMatch(/opened a second location/);
  });
});

describe('quoting an observation', () => {
  it('quotes a written finding as written', () => {
    const draft = draftFromTemplate({
      ...base,
      event: null,
      findings: [
        {
          id: 'evd_finding',
          classification: 'objective_defect',
          summary: 'The product pages carry no size information on mobile.',
          expired: false,
        },
      ],
    });

    expect(draft.body).toMatch(/the product pages carry no size information on mobile/i);
  });

  it.each([
    [
      'a slab of concatenated page furniture',
      'Harbour & Co — Aberdeen Harbour & Co Marine engineering, Aberdeen Subsea equipment maintenance and certification for North Sea operators. Established 1987.',
    ],
    ['text carrying an address', 'Get in touch at enquiries@harbourco.test for a quote.'],
    ['text carrying a phone number', 'Call the studio on +44 1224 555 0134 to discuss a project.'],
    ['something too short to say anything', 'Slow.'],
  ])('refuses to paste %s back at the recipient', (_label, summary) => {
    const draft = draftFromTemplate({
      ...base,
      event: null,
      findings: [{ id: 'evd_finding', classification: 'objective_defect', summary, expired: false }],
    });

    expect(draft.body).not.toContain(summary);
    expect(draft.omissions.join(' ')).toMatch(/not a single readable statement/i);
    // It still cites the retrieval it made — the claim is dropped, not the
    // grounding, because looking at the site is itself a thing that happened.
    expect(draft.groundingEvidenceIds).toContain('evd_finding');
  });

  it('never asserts a commercial hypothesis', () => {
    const draft = draftFromTemplate({
      ...base,
      event: null,
      findings: [
        {
          id: 'evd_guess',
          classification: 'commercial_hypothesis',
          summary: 'They are probably losing mobile sales because of this.',
          expired: false,
        },
        {
          id: 'evd_fact',
          classification: 'objective_defect',
          summary: 'The mobile menu covers the page and cannot be dismissed.',
          expired: false,
        },
      ],
    });

    expect(draft.body).not.toMatch(/losing mobile sales/i);
    expect(draft.body).toMatch(/the mobile menu covers the page/i);
    expect(draft.omissions.join(' ')).toMatch(/hypothes/i);
  });
});
