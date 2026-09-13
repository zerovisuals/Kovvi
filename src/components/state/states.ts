import type { NonEmptyActions, StateTone } from './StatePanel';

/**
 * THE FIFTEEN REQUIRED STATES (brief §3)
 *
 * Defined as data so the `/states` gallery and the running app render exactly
 * the same content — a gallery that drifts from the product is worse than none.
 *
 * The writing rules these follow, because empty states are where a product's
 * honesty actually shows:
 *
 *  - Never imply a fact we do not have. "No website found" is a claim; "we
 *    searched these places and found nothing" is what we can defend.
 *  - Distinguish "could not check" from "checked, nothing there". Most of these
 *    states exist precisely to hold that line.
 *  - Name what survived. A capped run keeps its results; say so, because the
 *    user paid for them.
 *  - Every state offers a way forward. The type makes an empty action list a
 *    compile error.
 */

export type StateKey =
  | 'loading'
  | 'no_matches'
  | 'partial_results'
  | 'source_unavailable'
  | 'identity_conflict'
  | 'unknown_website'
  | 'no_contact'
  | 'expired_evidence'
  | 'duplicate'
  | 'research_capped'
  | 'account_disconnected'
  | 'campaign_paused'
  | 'failed_send'
  | 'opted_out'
  | 'subscription_inactive';

export type StateDefinition = {
  readonly key: StateKey;
  readonly tone: StateTone;
  readonly glyph: string;
  readonly title: string;
  readonly explanation: string;
  readonly whatWeKnow?: string;
  readonly preserved?: string;
  readonly actions: NonEmptyActions;
  /** Where this appears in the product. Shown in the gallery, not the app. */
  readonly appearsIn: readonly string[];
  /** What in the data causes it. Also the gallery's documentation. */
  readonly trigger: string;
};

export const STATE_DEFINITIONS: readonly StateDefinition[] = [
  {
    key: 'loading',
    tone: 'neutral',
    glyph: '◴',
    title: 'Researching',
    explanation:
      'Work is in progress. Each stage reports its real counts as it finishes, so you can see what has actually been done rather than a bar filling up.',
    whatWeKnow: 'Results appear as they are confirmed; you do not have to wait for the whole run.',
    actions: [
      { label: 'View run detail', href: '/runs', primary: true },
      { label: 'Stop run', note: 'Keeps everything found so far.' },
    ],
    appearsIn: ['Today', 'Discover', 'Run detail'],
    trigger: 'A research run has jobs in queued, claimed or running state.',
  },
  {
    key: 'no_matches',
    tone: 'neutral',
    glyph: '∅',
    title: 'No organizations matched',
    explanation:
      'The run completed and every source answered. Nothing met your filters — this is a real result, not a failure.',
    whatWeKnow:
      'All selected sources responded. Widening the region, lowering the price floor or extending the freshness window usually surfaces more.',
    actions: [
      { label: 'Adjust filters', href: '/discover', primary: true },
      { label: 'Save this search', note: 'Re-runs when new activity appears.' },
    ],
    appearsIn: ['Shortlist', 'Run detail'],
    trigger: 'Run completed with full coverage and zero opportunities.',
  },
  {
    key: 'partial_results',
    tone: 'caution',
    glyph: '◐',
    title: 'Partial coverage',
    explanation:
      'Some sources answered and some did not. These results are real, but they are not the full picture for your filters.',
    whatWeKnow:
      'The coverage panel lists which sources answered and which did not. A source that failed is not evidence that nothing was there.',
    preserved: 'Everything already found is saved and does not need re-running.',
    actions: [
      { label: 'See source coverage', primary: true },
      { label: 'Retry failed sources', note: 'Only re-runs what did not answer.' },
    ],
    appearsIn: ['Shortlist', 'Run detail', 'Discover'],
    trigger: 'run.coverage contains an entry with failed > 0 or absent = true.',
  },
  {
    key: 'source_unavailable',
    tone: 'uncertain',
    glyph: '⊘',
    title: 'Source not connected',
    explanation:
      'This source needs credentials that have not been added, so it did not run. It has not returned zero results — it has not looked.',
    whatWeKnow:
      'Other sources ran normally. Results are complete for those, and this gap is recorded on the run.',
    actions: [
      { label: 'Connect source', href: '/settings/connections', primary: true },
      { label: 'Continue without it', note: 'The run is marked as partial coverage.' },
    ],
    appearsIn: ['Discover', 'Shortlist', 'Settings → Connections'],
    trigger: 'A capability required by an adapter is absent, or its circuit breaker is open.',
  },
  {
    key: 'identity_conflict',
    tone: 'critical',
    glyph: '⇄',
    title: 'Two businesses share this name',
    explanation:
      'We found more than one organization that could be this one, and we cannot tell them apart from public information alone.',
    whatWeKnow:
      'Outreach is blocked until this is resolved, whatever the opportunity scores. Contacting the wrong company about a competitor’s website is worse than not contacting anyone.',
    actions: [
      { label: 'Compare and resolve', primary: true },
      { label: 'Dismiss both', note: 'Neither will appear in future runs.' },
    ],
    appearsIn: ['Opportunity detail', 'Campaign review', 'Shortlist'],
    trigger: 'An identity_conflict row with status = open references this business.',
  },
  {
    key: 'unknown_website',
    tone: 'uncertain',
    glyph: '?',
    title: 'No website confirmed',
    explanation:
      'We searched the sources listed below and could not confirm an official site. That is different from this business not having one.',
    whatWeKnow:
      'A directory with a blank website field is not evidence of absence. If you know the address, adding it takes about ten seconds and improves every future run.',
    actions: [
      { label: 'Add the website', primary: true },
      { label: 'Mark as no website', note: 'Records your confirmation, not a guess.' },
      { label: 'Search again' },
    ],
    appearsIn: ['Opportunity detail', 'Shortlist'],
    trigger: "website_candidate.identity_status is 'none_found_after_search' or 'inaccessible'.",
  },
  {
    key: 'no_contact',
    tone: 'caution',
    glyph: '⊙',
    title: 'No public contact route',
    explanation:
      'We found no publicly listed way to reach this business. We do not guess addresses from name patterns.',
    whatWeKnow:
      'A contact form counts as a route even when no address is published. If none was found, none was listed on the pages we could reach.',
    actions: [
      { label: 'Add a contact', primary: true },
      { label: 'Re-check the site', note: 'Contact pages are often added later.' },
    ],
    appearsIn: ['Opportunity detail', 'Campaign review'],
    trigger: 'No contact rows exist for the business.',
  },
  {
    key: 'expired_evidence',
    tone: 'caution',
    glyph: '◔',
    title: 'Evidence is out of date',
    explanation:
      'The reason to approach this business has aged past its freshness window. Sending outreach that cites it risks referring to something that is no longer true.',
    whatWeKnow:
      'The opportunity is not gone; its evidence simply needs re-checking. Congratulating someone on a launch from eight months ago is worse than not writing at all.',
    preserved: 'The organization, its contacts and your notes are unchanged.',
    actions: [
      { label: 'Refresh evidence', primary: true, note: 'Uses one assessment credit.' },
      { label: 'Send anyway', note: 'Only sensible if you already know it still holds.' },
    ],
    appearsIn: ['Opportunity detail', 'Campaign review'],
    trigger: 'evidence.expires_at is in the past for evidence this opportunity cites.',
  },
  {
    key: 'duplicate',
    tone: 'neutral',
    glyph: '⧉',
    title: 'Already in your list',
    explanation:
      'This business was found by more than one industry module. It is one prospect, shown once, and charged once.',
    whatWeKnow: 'Both modules’ evidence is merged onto the single opportunity below.',
    actions: [
      { label: 'Open the opportunity', primary: true },
      { label: 'See which modules found it' },
    ],
    appearsIn: ['Shortlist', 'Run detail'],
    trigger: 'An opportunity has more than one opportunity_module_hit row.',
  },
  {
    key: 'research_capped',
    tone: 'caution',
    glyph: '⊣',
    title: 'Run reached its limit',
    explanation:
      'This run hit the ceiling you set before starting, so it stopped cleanly rather than continuing to spend.',
    whatWeKnow:
      'Nothing was discarded. Remaining candidates were never charged for, so raising the cap and re-running only pays for the new work.',
    preserved: 'Every organization assessed before the cap is saved and ready to review.',
    actions: [
      { label: 'Review what was found', primary: true },
      { label: 'Raise the cap and continue' },
    ],
    appearsIn: ['Run detail', 'Shortlist', 'Billing'],
    trigger: "research_run.status is 'capped'.",
  },
  {
    key: 'account_disconnected',
    tone: 'critical',
    glyph: '⚯',
    title: 'Connection lost',
    explanation:
      'A connected account stopped accepting our credentials — usually a revoked token or a changed password.',
    whatWeKnow:
      'Sending paused automatically the moment this was detected. Nothing was sent with a failing connection.',
    preserved: 'Scheduled messages are held, not cancelled. They resume once you reconnect.',
    actions: [
      { label: 'Reconnect', href: '/settings/connections', primary: true },
      { label: 'Review held messages' },
    ],
    appearsIn: ['Settings → Connections', 'Outreach', 'App banner'],
    trigger: 'A capability that was live begins failing authentication.',
  },
  {
    key: 'campaign_paused',
    tone: 'caution',
    glyph: '❙❙',
    title: 'Campaign paused',
    explanation:
      'This campaign has stopped sending. The reason is recorded below and nothing goes out until you resume it.',
    whatWeKnow:
      'Messages already sent are unaffected. Anything scheduled is held rather than cancelled.',
    actions: [
      { label: 'Resume campaign', primary: true },
      { label: 'Review remaining recipients', note: 'Shows the actual list, not a count.' },
    ],
    appearsIn: ['Outreach', 'Campaign review'],
    trigger: "campaign.status is 'paused'; pause_reason explains why.",
  },
  {
    key: 'failed_send',
    tone: 'critical',
    glyph: '✕',
    title: 'Message could not be sent',
    explanation:
      'The provider rejected this message. The reason it gave is shown below rather than summarised.',
    whatWeKnow:
      'A hard bounce suppresses the address automatically. A soft failure can be retried; retrying is never automatic, because repeated delivery to a broken address damages your sending reputation.',
    preserved: 'The draft and its approval are intact.',
    actions: [
      { label: 'Retry send', primary: true },
      { label: 'Edit the message', note: 'Editing requires approval again.' },
      { label: 'Log a manual send instead' },
    ],
    appearsIn: ['Outreach', 'Conversations'],
    trigger: "send_attempt.status is 'failed' or 'bounced'.",
  },
  {
    key: 'opted_out',
    tone: 'critical',
    glyph: '⊗',
    title: 'This contact opted out',
    explanation:
      'They asked not to be contacted. Kovvi will not send to them again, and this cannot be overridden in the product.',
    whatWeKnow:
      'The suppression applies across your workspace and is permanent. Opt-outs never expire.',
    actions: [
      { label: 'Remove from campaign', primary: true },
      { label: 'Find another contact', note: 'A different person at the same business.' },
    ],
    appearsIn: ['Campaign review', 'Opportunity detail', 'Conversations'],
    trigger: 'A suppression row matches the contact’s value hash.',
  },
  {
    key: 'subscription_inactive',
    tone: 'uncertain',
    glyph: '◇',
    title: 'Billing is not connected',
    explanation:
      'No payment provider is configured for this workspace, so there is no subscription to report. This is the real state, not a trial.',
    whatWeKnow:
      'Plan allowances still apply and usage is metered for real, so nothing you do now is lost when billing is connected.',
    preserved: 'All research, opportunities and drafts remain available.',
    actions: [
      { label: 'See usage and allowance', href: '/settings/billing', primary: true },
      { label: 'Export your data', note: 'Available regardless of billing state.' },
    ],
    appearsIn: ['Billing', 'App banner'],
    trigger: "subscription.status is 'absent', 'cancelled' or 'past_due'.",
  },
];

const BY_KEY = new Map(STATE_DEFINITIONS.map((definition) => [definition.key, definition]));

export function getState(key: StateKey): StateDefinition {
  const definition = BY_KEY.get(key);
  if (!definition) throw new Error(`Unknown state: ${key}`);
  return definition;
}
