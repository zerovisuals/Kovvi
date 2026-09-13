import { createHash } from 'node:crypto';
import { eventAgeDays, freshnessWindowDays } from '../evidence/dates';

/**
 * RANKING
 *
 * The brief is explicit that fit, opportunity evidence, timing, activity and
 * contactability must be shown SEPARATELY, and that the weights are "proposed
 * heuristics, not calibrated purchase probabilities".
 *
 * So this module does two things carefully. It keeps the components apart, so
 * the UI can show why something ranked rather than only how high. And it labels
 * the weighting as a heuristic everywhere it surfaces — because a single number
 * with a decimal point implies a calibration nobody has done, and users act on
 * implied precision.
 */

export const WEIGHTS = {
  fit: 30,
  evidence: 25,
  timing: 20,
  activity: 15,
  contactability: 10,
} as const;

/** Shown wherever a score appears. Not decoration — it is the honest caveat. */
export const HEURISTIC_NOTE =
  'A starting heuristic weighted 30/25/20/15/10, not a calibrated likelihood of winning the work. Scores are comparable within one industry, not across them.';

export type ScoreComponent = {
  readonly component: keyof typeof WEIGHTS;
  readonly label: string;
  /** 0–100 before weighting. */
  readonly raw: number;
  /** After weighting; sums to the total. */
  readonly contribution: number;
  readonly evidenceId?: string;
};

export type Confidence = 'high' | 'medium' | 'low';

export type ScoreInput = {
  /** Confirmed portfolio claims that matched this prospect. */
  readonly matchedClaims: readonly { readonly value: string; readonly claimId: string }[];
  readonly industryMatches: boolean;
  readonly regionMatches: boolean;

  readonly evidenceCount: number;
  readonly objectiveDefects: number;
  /** True when the site could not be read — caps several components. */
  readonly inconclusive: boolean;

  readonly latestEvent: {
    readonly date: Date | null;
    readonly type: string;
    readonly evidenceId?: string;
  } | null;

  readonly hasVerifiedContact: boolean;
  readonly hasAnyContact: boolean;
  readonly identityConfirmed: boolean;
};

export type Score = {
  readonly total: number;
  readonly components: readonly ScoreComponent[];
  readonly confidence: Confidence;
  /** Why this confidence band, in one line. */
  readonly confidenceReason: string;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function scoreOpportunity(input: ScoreInput): Score {
  const components: ScoreComponent[] = [];

  /* ── Fit: does the freelancer's own work match this prospect? ──────────── */
  const claimScore = Math.min(60, input.matchedClaims.length * 20);
  const fitRaw = clamp(
    claimScore + (input.industryMatches ? 25 : 0) + (input.regionMatches ? 15 : 0),
  );
  components.push({
    component: 'fit',
    label:
      input.matchedClaims.length > 0
        ? `${input.matchedClaims.length} confirmed portfolio claim(s) match`
        : 'No confirmed portfolio claims match yet',
    raw: fitRaw,
    contribution: Math.round((fitRaw / 100) * WEIGHTS.fit),
  });

  /* ── Evidence: how much do we actually know? ───────────────────────────── */
  const evidenceRaw = input.inconclusive
    ? // We could not read the site, so we know very little. Capping this is
      // what stops an unreadable prospect ranking as though it were understood.
      Math.min(25, input.evidenceCount * 8)
    : clamp(input.evidenceCount * 12 + input.objectiveDefects * 10);
  components.push({
    component: 'evidence',
    label: input.inconclusive
      ? 'The website could not be read, so there is little to go on'
      : `${input.evidenceCount} piece(s) of evidence, ${input.objectiveDefects} objective defect(s)`,
    raw: evidenceRaw,
    contribution: Math.round((evidenceRaw / 100) * WEIGHTS.evidence),
  });

  /* ── Timing: is there a reason to write NOW? ───────────────────────────── */
  const age = eventAgeDays(input.latestEvent?.date ?? null);
  const window = input.latestEvent ? freshnessWindowDays(input.latestEvent.type) : 90;

  let timingRaw = 0;
  let timingLabel = 'No dated event found — no particular reason to write now';

  if (age !== null) {
    if (age < 0) {
      timingRaw = 70;
      timingLabel = 'An announced event has not happened yet';
    } else if (age <= window) {
      // Decays across the window rather than cliff-edging, because relevance
      // fades gradually and a hard cutoff would misrepresent that.
      timingRaw = clamp(100 - (age / window) * 60);
      timingLabel = `A relevant event ${age} day(s) ago`;
    } else {
      timingRaw = 0;
      timingLabel = `The most recent event is ${age} days old — past the point where mentioning it helps`;
    }
  }

  components.push({
    component: 'timing',
    label: timingLabel,
    raw: timingRaw,
    contribution: Math.round((timingRaw / 100) * WEIGHTS.timing),
    ...(input.latestEvent?.evidenceId ? { evidenceId: input.latestEvent.evidenceId } : {}),
  });

  /* ── Activity: is this a going concern? ────────────────────────────────── */
  const activityRaw = clamp(
    (input.latestEvent ? 50 : 0) + (input.evidenceCount > 2 ? 30 : 0) + (input.identityConfirmed ? 20 : 0),
  );
  components.push({
    component: 'activity',
    label: input.latestEvent
      ? 'Recent public activity found'
      : 'No recent public activity found',
    raw: activityRaw,
    contribution: Math.round((activityRaw / 100) * WEIGHTS.activity),
  });

  /* ── Contactability: can this actually be acted on? ────────────────────── */
  const contactRaw = input.hasVerifiedContact ? 100 : input.hasAnyContact ? 55 : 0;
  components.push({
    component: 'contactability',
    label: input.hasVerifiedContact
      ? 'A verified contact route'
      : input.hasAnyContact
        ? 'A contact route, unverified'
        : 'No public contact route found',
    raw: contactRaw,
    contribution: Math.round((contactRaw / 100) * WEIGHTS.contactability),
  });

  const total = components.reduce((sum, component) => sum + component.contribution, 0);

  /* ── Confidence: about the INPUTS, not about the outcome ───────────────── */
  let confidence: Confidence = 'low';
  let confidenceReason = 'Little confirmed information about this business.';

  if (input.inconclusive) {
    confidence = 'low';
    confidenceReason = 'The website could not be read, so most of this is inferred from elsewhere.';
  } else if (input.identityConfirmed && input.evidenceCount >= 3 && input.hasVerifiedContact) {
    confidence = 'high';
    confidenceReason = 'Identity confirmed, several pieces of evidence, and a verified contact.';
  } else if (input.identityConfirmed && input.evidenceCount >= 1) {
    confidence = 'medium';
    confidenceReason = 'Identity confirmed, but the evidence is thin in places.';
  }

  return { total, components, confidence, confidenceReason };
}

/**
 * The dedupe key for an opportunity.
 *
 * Derived from the business identity alone, so the SAME business found by two
 * different industry modules produces the same key — one opportunity, charged
 * once (acceptance case 15). An apparel brand that also runs an esports team is
 * one prospect with one inbox, not two.
 */
export function dedupeKey(businessId: string): string {
  return createHash('sha256').update(businessId).digest('hex').slice(0, 32);
}
