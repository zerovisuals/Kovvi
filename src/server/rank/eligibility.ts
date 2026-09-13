/**
 * CAN THIS OPPORTUNITY BE CONTACTED?
 *
 * One function, checked everywhere outreach is possible — the campaign builder,
 * the review screen, and again inside the dispatch transaction. A check that
 * exists in three slightly different versions is a check that will disagree
 * with itself, and the disagreement will be discovered by a user receiving an
 * email they opted out of.
 *
 * The order matters. Identity comes first because it is the only failure that
 * cannot be undone: an unsubscribe is embarrassing, but emailing the wrong
 * company about a competitor's website is a mistake the freelancer wears
 * publicly.
 *
 * Note what is absent from the inputs: the score. Nothing here can be
 * overridden by ranking well.
 */

export type BlockReason =
  | 'identity_conflict'
  | 'no_contact'
  | 'evidence_expired'
  | 'suppressed'
  | 'subscription_inactive'
  | 'sample_workspace';

export type EligibilityInput = {
  readonly identityConflictOpen: boolean;
  readonly hasContact: boolean;
  readonly evidenceExpired: boolean;
  readonly suppressed: boolean;
  readonly subscriptionActive: boolean;
  readonly isSampleWorkspace: boolean;
  /** Accepted for completeness; deliberately not consulted. */
  readonly totalScore?: number;
};

export type Eligibility = {
  readonly eligible: boolean;
  readonly blockedReason: BlockReason | null;
  /** Shown to the user. Explains the block in terms of consequence. */
  readonly explanation: string;
};

export function campaignEligibility(input: EligibilityInput): Eligibility {
  if (input.suppressed) {
    return {
      eligible: false,
      blockedReason: 'suppressed',
      explanation:
        'This contact asked not to be contacted. That cannot be overridden in the product.',
    };
  }

  if (input.identityConflictOpen) {
    return {
      eligible: false,
      blockedReason: 'identity_conflict',
      explanation:
        'We cannot reliably tell this business apart from another with the same name. Writing to the wrong one is worse than not writing at all.',
    };
  }

  if (input.isSampleWorkspace) {
    return {
      eligible: false,
      blockedReason: 'sample_workspace',
      explanation:
        'This is the sample workspace. The organizations in it are invented, so nothing can be sent from here.',
    };
  }

  if (!input.hasContact) {
    return {
      eligible: false,
      blockedReason: 'no_contact',
      explanation:
        'No public contact route was found. Kovvi does not guess addresses from name patterns.',
    };
  }

  if (input.evidenceExpired) {
    return {
      eligible: false,
      blockedReason: 'evidence_expired',
      explanation:
        'The reason to write has aged past its freshness window. Refresh it before sending, or the message will refer to something that may no longer be true.',
    };
  }

  if (!input.subscriptionActive) {
    return {
      eligible: false,
      blockedReason: 'subscription_inactive',
      explanation:
        'Sending needs an active subscription. Research, evidence and drafts remain available.',
    };
  }

  return {
    eligible: true,
    blockedReason: null,
    explanation: 'Ready to send once you approve the message.',
  };
}
