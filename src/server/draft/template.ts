import { createHash } from 'node:crypto';
import { describeAge, type DatePrecision } from '../evidence/dates';

/**
 * DETERMINISTIC OUTREACH DRAFTING
 *
 * This is what runs when no LLM is connected, and it is not a degraded mode —
 * it is the honest floor. Every sentence it produces is assembled from evidence
 * that exists, and it refuses to produce a sentence it cannot support.
 *
 * The rules it follows are the brief's, and they are unusual for outreach
 * tooling because they are mostly about what NOT to say:
 *
 *  - Never state a commercial hypothesis as fact. "You may be losing mobile
 *    sales" is a guess; only observations we actually made get asserted.
 *  - Never claim a revenue improvement. Nobody knows that.
 *  - Never mention an event whose evidence has expired, and never describe an
 *    old event as recent.
 *  - Never reference portfolio work the user has not confirmed.
 *  - Say who is writing and why they are writing NOW, because a message with no
 *    reason to exist is what makes outreach feel automated.
 */

export const DRAFTER_VERSION = 'template/1';

export type DraftEvidence = {
  readonly id: string;
  readonly classification: 'objective_defect' | 'subjective_observation' | 'commercial_hypothesis';
  readonly summary: string;
  readonly expired: boolean;
};

export type DraftEvent = {
  readonly evidenceId: string;
  readonly title: string;
  readonly date: Date | null;
  readonly precision: DatePrecision;
  readonly expired: boolean;
};

export type DraftInput = {
  readonly businessName: string;
  readonly senderName: string;
  readonly senderService: string;
  /** A confirmed portfolio project. Unconfirmed work is never cited. */
  readonly portfolio?: {
    readonly title: string;
    readonly url: string;
    readonly role: string | null;
  } | null;
  readonly event?: DraftEvent | null;
  readonly findings: readonly DraftEvidence[];
  readonly contactRole?: string | null;
};

export type Draft = {
  readonly subject: string;
  readonly body: string;
  readonly bodyHash: string;
  /** Never empty. The database refuses a message without these. */
  readonly groundingEvidenceIds: readonly string[];
  readonly drafterVersion: string;
  /**
   * What the draft deliberately left out, and why. Shown beside the draft so
   * the user can see the reasoning rather than wondering what was missed.
   */
  readonly omissions: readonly string[];
};

export class UngroundedDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UngroundedDraftError';
  }
}

export function draftFromTemplate(input: DraftInput): Draft {
  const grounding: string[] = [];
  const omissions: string[] = [];
  const paragraphs: string[] = [];

  /* ── Why now ───────────────────────────────────────────────────────────── */
  let opener: string;

  if (input.event && !input.event.expired && input.event.date) {
    const age = describeAge(input.event.date, input.event.precision);
    grounding.push(input.event.evidenceId);
    opener = `I saw ${input.businessName} ${lowerFirst(input.event.title)} — ${age}.`;
  } else {
    if (input.event?.expired) {
      omissions.push(
        'The dated event was left out: its evidence is past its freshness window, and referring to something that may no longer be true is worse than not mentioning it.',
      );
    }
    opener = `I came across ${input.businessName} while looking at ${input.senderService} work in your area.`;
  }

  paragraphs.push(opener);

  /* ── What we actually observed ─────────────────────────────────────────── */
  const assertable = input.findings.filter(
    (finding) => !finding.expired && finding.classification !== 'commercial_hypothesis',
  );

  const hypotheses = input.findings.filter(
    (finding) => finding.classification === 'commercial_hypothesis',
  );

  if (hypotheses.length > 0) {
    omissions.push(
      `${hypotheses.length} commercial ${hypotheses.length === 1 ? 'hypothesis was' : 'hypotheses were'} left out. They are inferences about the business, not things we observed, and stating them as fact is how outreach earns its reputation.`,
    );
  }

  if (assertable.length > 0) {
    const first = assertable[0]!;
    grounding.push(first.id);

    const observation =
      first.classification === 'objective_defect'
        ? `One thing I noticed on your site: ${lowerFirst(first.summary)}`
        : `One thing that stood out on your site: ${lowerFirst(first.summary)}`;

    paragraphs.push(
      `${observation} I had a look on both desktop and a phone before writing, so this is what I actually saw rather than a guess.`,
    );
  } else if (input.findings.length === 0) {
    // Deliberately says so, rather than inventing an angle.
    paragraphs.push(
      `I have not audited your site in any depth — I would rather ask than assume.`,
    );
    omissions.push(
      'No site observations were available, so the draft makes none. A message that invents a problem is worse than one with no hook.',
    );
  }

  /* ── Who is writing ────────────────────────────────────────────────────── */
  if (input.portfolio) {
    const role = input.portfolio.role ? ` (${input.portfolio.role})` : '';
    paragraphs.push(
      `I am ${input.senderName}; I do ${input.senderService}. Closest recent thing I have done is ${input.portfolio.title}${role}: ${input.portfolio.url}`,
    );
  } else {
    paragraphs.push(`I am ${input.senderName}; I do ${input.senderService}.`);
    omissions.push(
      'No portfolio project was cited, because none is both confirmed and relevant. Kovvi never references work you have not confirmed.',
    );
  }

  paragraphs.push(
    `If it is useful I can send a short note on what I would change and roughly what it would take. If not, no follow-up — just say so.`,
  );

  /**
   * The structural guarantee, asserted rather than assumed. The database's
   * CHECK constraint would catch this too, but failing here produces an error
   * that names the cause instead of a constraint violation three layers down.
   */
  if (grounding.length === 0) {
    throw new UngroundedDraftError(
      `Refusing to draft a message to ${input.businessName}: no usable evidence. ` +
        `Every claim in an outreach message must cite something we actually retrieved.`,
    );
  }

  const body = paragraphs.join('\n\n');

  return {
    subject: input.event && !input.event.expired
      ? `${input.businessName} — quick note`
      : `Quick note about your website`,
    body,
    bodyHash: createHash('sha256').update(body).digest('hex'),
    groundingEvidenceIds: [...new Set(grounding)],
    drafterVersion: DRAFTER_VERSION,
    omissions,
  };
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Phrases that must never appear in outreach Kovvi produces.
 *
 * The brief forbids guaranteed revenue claims and unauthorised discounts.
 * Checking the OUTPUT rather than trusting the generator matters more once an
 * LLM is connected, since a model will reach for exactly this language.
 */
const FORBIDDEN_CLAIMS: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bguarantee(?:d|s)?\b/i, why: 'Guarantees about outcomes nobody can promise.' },
  { pattern: /\b(?:double|triple|increase)\s+your\s+(?:revenue|sales|traffic|conversions)/i, why: 'A promised commercial result.' },
  { pattern: /\b\d+%\s+(?:more|increase|uplift|growth)\b/i, why: 'A quantified improvement with no basis.' },
  { pattern: /\b(?:discount|% off|free of charge|no cost)\b/i, why: 'A commercial term the user did not authorise.' },
  { pattern: /\brisk[- ]free\b/i, why: 'An implied guarantee.' },
];

export type ClaimAudit = { readonly ok: boolean; readonly violations: readonly string[] };

/** Audits a draft — however it was produced — before it can be approved. */
export function auditDraft(body: string): ClaimAudit {
  const violations = FORBIDDEN_CLAIMS.filter((rule) => rule.pattern.test(body)).map(
    (rule) => rule.why,
  );

  return { ok: violations.length === 0, violations };
}
