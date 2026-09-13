import { describe, expect, it } from 'vitest';
import { auditDraft, draftFromTemplate, UngroundedDraftError } from '@/server/draft/template';
import { campaignEligibility } from '@/server/rank/eligibility';
import { freshnessWindowDays } from '@/server/evidence/dates';

/**
 * ACCEPTANCE CASE 11 — "Expired campaign evidence: request refresh before new
 * outreach."
 *
 * Outreach citing stale evidence is worse than no outreach. "Congratulations on
 * the new location" eight months after it opened tells the recipient exactly
 * what produced the message, and the freelancer's name is on it.
 *
 * Two layers: eligibility blocks the send, and the drafter refuses to use the
 * expired fact even if something got past the first check.
 */

const base = {
  businessName: 'Harrow & Pike',
  senderName: 'Sam',
  senderService: 'ecommerce websites',
  portfolio: { title: 'Fieldnote Coffee', url: 'https://example.test/fieldnote', role: 'design and build' },
};

describe('eligibility', () => {
  it('blocks sending when the evidence has expired', () => {
    const eligibility = campaignEligibility({
      identityConflictOpen: false,
      hasContact: true,
      evidenceExpired: true,
      suppressed: false,
      subscriptionActive: true,
      isSampleWorkspace: false,
    });

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockedReason).toBe('evidence_expired');
    expect(eligibility.explanation).toMatch(/refresh it before sending/i);
    // States the consequence, not just the rule.
    expect(eligibility.explanation).toMatch(/no longer be true/i);
  });

  it('allows sending once it is refreshed', () => {
    const eligibility = campaignEligibility({
      identityConflictOpen: false,
      hasContact: true,
      evidenceExpired: false,
      suppressed: false,
      subscriptionActive: true,
      isSampleWorkspace: false,
    });

    expect(eligibility.eligible).toBe(true);
  });
});

describe('the drafter', () => {
  it('omits an expired event and says why', () => {
    const draft = draftFromTemplate({
      ...base,
      event: {
        evidenceId: 'evd_old',
        title: 'opened a second location',
        date: new Date('2024-03-11'),
        precision: 'day',
        expired: true,
      },
      findings: [
        {
          id: 'evd_finding',
          classification: 'objective_defect',
          summary: 'The site has no viewport meta tag, so it is not laid out for phones.',
          expired: false,
        },
      ],
    });

    expect(draft.body).not.toMatch(/second location/i);
    expect(draft.groundingEvidenceIds).not.toContain('evd_old');
    expect(draft.omissions.join(' ')).toMatch(/freshness window/i);
  });

  it('uses a fresh event, with its real age', () => {
    const recent = new Date(Date.now() - 6 * 86_400_000);

    const draft = draftFromTemplate({
      ...base,
      event: {
        evidenceId: 'evd_new',
        title: 'launched an autumn collection',
        date: recent,
        precision: 'day',
        expired: false,
      },
      findings: [],
    });

    expect(draft.body).toMatch(/autumn collection/i);
    expect(draft.body).toMatch(/6 days ago/);
    expect(draft.groundingEvidenceIds).toContain('evd_new');
  });

  it('never states a commercial hypothesis as fact', () => {
    const draft = draftFromTemplate({
      ...base,
      event: null,
      findings: [
        {
          id: 'evd_guess',
          classification: 'commercial_hypothesis',
          summary: 'They are probably losing mobile sales.',
          expired: false,
        },
        {
          id: 'evd_fact',
          classification: 'objective_defect',
          summary: 'The checkout page returns a 500 error.',
          expired: false,
        },
      ],
    });

    expect(draft.body).not.toMatch(/losing mobile sales/i);
    expect(draft.body).toMatch(/500 error/);
    expect(draft.groundingEvidenceIds).toContain('evd_fact');
    expect(draft.groundingEvidenceIds).not.toContain('evd_guess');
    expect(draft.omissions.join(' ')).toMatch(/inferences about the business/i);
  });

  it('refuses to draft at all with nothing to cite', () => {
    // The structural guarantee, at the layer above the database constraint.
    expect(() =>
      draftFromTemplate({ ...base, event: null, findings: [] }),
    ).toThrow(UngroundedDraftError);
  });

  it('says plainly when it has no hook rather than inventing one', () => {
    const draft = draftFromTemplate({
      ...base,
      event: {
        evidenceId: 'evd_ok',
        title: 'rebranded',
        date: new Date(Date.now() - 3 * 86_400_000),
        precision: 'day',
        expired: false,
      },
      findings: [],
    });

    expect(draft.body).toMatch(/rather ask than assume/i);
    expect(draft.omissions.join(' ')).toMatch(/invents a problem/i);
  });

  it('never references unconfirmed portfolio work', () => {
    const draft = draftFromTemplate({
      ...base,
      portfolio: null,
      event: {
        evidenceId: 'evd_ok',
        title: 'opened a new studio',
        date: new Date(Date.now() - 2 * 86_400_000),
        precision: 'day',
        expired: false,
      },
      findings: [],
    });

    expect(draft.omissions.join(' ')).toMatch(/work you have not confirmed/i);
  });
});

describe('the claim audit', () => {
  it.each([
    'We guarantee a 40% increase in conversions.',
    'This will double your revenue.',
    'Risk-free, and I can offer a discount.',
    'Expect 30% more traffic within a month.',
  ])('rejects: %s', (body) => {
    const audit = auditDraft(body);
    expect(audit.ok).toBe(false);
    expect(audit.violations.length).toBeGreaterThan(0);
  });

  it('accepts an honest message', () => {
    const draft = draftFromTemplate({
      ...base,
      event: {
        evidenceId: 'evd_ok',
        title: 'launched a new collection',
        date: new Date(Date.now() - 4 * 86_400_000),
        precision: 'day',
        expired: false,
      },
      findings: [],
    });

    // The drafter's own output must pass the audit that gates every draft,
    // including ones an LLM will later produce.
    expect(auditDraft(draft.body).ok).toBe(true);
  });
});

describe('freshness windows', () => {
  it('gives durable events a longer life than perishable ones', () => {
    // A funding round stays relevant for months; a merch drop does not.
    expect(freshnessWindowDays('funding')).toBeGreaterThan(freshnessWindowDays('merch_drop'));
    expect(freshnessWindowDays('opening')).toBeGreaterThan(freshnessWindowDays('hiring'));
  });
});
