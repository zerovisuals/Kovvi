import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Every enum in Kovvi, in one place.
 *
 * Several of these carry the product's honesty guarantees structurally, and
 * are commented where the ABSENCE of a value is the point. An enum that cannot
 * express a dishonest state is worth more than a convention asking people not
 * to write one.
 */

/* ── Tenancy ─────────────────────────────────────────────────────────────── */

/**
 * Sample-ness is a property of the workspace, so it propagates to every child
 * record and can be filtered, exported and deleted as a unit — rather than
 * being a label bolted onto the UI.
 */
export const workspaceKind = pgEnum('workspace_kind', ['real', 'sample']);
export const memberRole = pgEnum('member_role', ['owner', 'member']);

/** Freelancers pause when booked; the product has to model that, not fight it. */
export const capacityState = pgEnum('capacity_state', ['open', 'booked']);

/**
 * Marks rows produced by seeding rather than by a user's own research. A real
 * workspace's queries filter on this unconditionally.
 */
export const dataOrigin = pgEnum('data_origin', ['real', 'sample']);

/* ── Uncertainty ─────────────────────────────────────────────────────────── */

/**
 * The core honesty primitive. Any fact that can be unknown is stored as a
 * (state, value, reason) triple with a CHECK constraint tying state to value,
 * so a NULL never silently means "absent".
 *
 * `conflicting` is distinct from `unknown`: we found two irreconcilable
 * answers, which is a different thing from having found none.
 */
export const factState = pgEnum('fact_state', ['known', 'unknown', 'conflicting']);

/**
 * Why a fact is not known. `not_searched` and `no_evidence` are deliberately
 * different: one means we never looked, the other that we looked and found
 * nothing. Collapsing them is how "no website listed" becomes "has no website".
 */
export const factReason = pgEnum('fact_reason', [
  'not_searched',
  'search_failed',
  'blocked',
  'no_evidence',
  'ambiguous',
]);

/** Presented as words. A fabricated percentage would imply calibration we lack. */
export const confidence = pgEnum('confidence', ['high', 'medium', 'low']);

/* ── Identity ────────────────────────────────────────────────────────────── */

export const brandStatus = pgEnum('brand_status', ['active', 'retired', 'renamed']);

/** Rebrands append an alias rather than overwriting; history is never destroyed. */
export const aliasKind = pgEnum('alias_kind', [
  'former_name',
  'trading_name',
  'handle',
  'legal_name',
  'former_domain',
]);

export const relationshipKind = pgEnum('relationship_kind', [
  'parent_of',
  'brand_of',
  'branch_of',
  'roster_of',
  'competes_in',
]);

/**
 * `resolved_distinct` and `resolved_same` record a human decision. An open
 * conflict blocks campaign eligibility regardless of how well the opportunity
 * scores — you do not email someone you cannot reliably identify.
 */
export const conflictStatus = pgEnum('conflict_status', [
  'open',
  'resolved_distinct',
  'resolved_same',
]);

export const businessMaturity = pgEnum('business_maturity', [
  'unknown',
  'new',
  'established',
  'scaling',
]);

/* ── Modules and sources ─────────────────────────────────────────────────── */

export const moduleId = pgEnum('module_id', [
  'fashion',
  'creators',
  'hospitality',
  'local_services',
  'professional',
  'software',
  'esports',
  'custom',
]);

export const accessMethod = pgEnum('access_method', [
  'public_http',
  'search_api',
  'manual_import',
  'provider_api',
]);

/** What a source adapter does when it cannot fulfil a request. */
export const failureBehaviour = pgEnum('failure_behaviour', [
  'partial_coverage',
  'retry_then_partial',
  'fail_run',
]);

/* ── Evidence ────────────────────────────────────────────────────────────── */

/**
 * The brief requires these kept separate. A slow-loading page is an objective
 * defect; "the brand feels dated" is a subjective observation; "they are
 * probably losing mobile sales" is a commercial hypothesis. Presenting the
 * third as the first is the category's characteristic dishonesty.
 */
export const claimClass = pgEnum('claim_class', [
  'objective_defect',
  'subjective_observation',
  'commercial_hypothesis',
]);

/**
 * NOTE THE ABSENCE OF 'llm'.
 *
 * The brief's rule is that a model's summary can never become its own
 * evidence. Rather than trusting everyone to remember that, there is simply
 * nowhere to put such a row: a model's output can only ever land in
 * `message.body`, which must cite pre-existing evidence ids.
 */
export const evidenceOrigin = pgEnum('evidence_origin', ['extractor', 'adapter', 'user']);

/**
 * Everything fetched from the public web is untrusted input, including any
 * instructions embedded in it. This drives the wrapping applied before content
 * is ever shown to a model.
 */
export const trustLevel = pgEnum('trust_level', ['untrusted_web', 'user_supplied', 'internal']);

export const eventType = pgEnum('event_type', [
  'collection_launch',
  'opening',
  'rebrand',
  'funding',
  'product_launch',
  'expansion',
  'roster_change',
  'merch_drop',
  'sponsorship',
  'hiring',
  'other',
]);

/**
 * An announcement dated "March 2024" is not the same as one dated "11 March
 * 2024". Storing the precision stops the UI implying a certainty the source
 * never gave.
 */
export const datePrecision = pgEnum('date_precision', [
  'day',
  'month',
  'quarter',
  'year',
  'unknown',
]);

/* ── Website identity and assessment ─────────────────────────────────────── */

/**
 * There is no null and no "none" here. `none_found_after_search` asserts that a
 * search happened and records what was tried, which is a claim we can defend.
 * "No website" as a bare fact is not.
 */
export const identityStatus = pgEnum('identity_status', [
  'confirmed_official',
  'probable',
  'conflicting',
  'inaccessible',
  'none_found_after_search',
]);

/**
 * `inconclusive_*` are first-class outcomes, not failures. A site that blocked
 * us tells us nothing about its quality, and saying otherwise would be the
 * single easiest way for this product to start lying.
 */
export const assessmentStatus = pgEnum('assessment_status', [
  'complete',
  'partial',
  'inconclusive_blocked',
  'inconclusive_timeout',
  'failed',
]);

export const viewport = pgEnum('viewport', ['desktop', 'mobile']);
export const captureKind = pgEnum('capture_kind', ['screenshot', 'dom_snapshot']);

/* ── Contacts ────────────────────────────────────────────────────────────── */

export const contactChannel = pgEnum('contact_channel', [
  'email',
  'contact_form',
  'phone',
  'discord',
  'instagram',
  'linkedin',
  'x',
  'website',
  'other',
]);

/** A public listing is `probable` at best until something corroborates it. */
export const contactVerification = pgEnum('contact_verification', [
  'verified',
  'probable',
  'unverified',
]);

/* ── Opportunities and pipeline ──────────────────────────────────────────── */

/** Sales stages, kept separate from research/job status by design. */
export const pipelineStage = pgEnum('pipeline_stage', [
  'discovered',
  'shortlisted',
  'prepared',
  'approved',
  'contacted',
  'replied',
  'qualified',
  'quoted',
  'won',
  'lost',
  'suppressed',
]);

/** Why an opportunity cannot be contacted, regardless of its score. */
export const blockReason = pgEnum('block_reason', [
  'identity_conflict',
  'no_contact',
  'evidence_expired',
  'suppressed',
  'subscription_inactive',
  'sample_workspace',
]);

/* ── Runs and jobs ───────────────────────────────────────────────────────── */

export const runStatus = pgEnum('run_status', [
  'queued',
  'running',
  'completed',
  'completed_partial',
  'capped',
  'cancelled',
  'failed',
]);

export const stageId = pgEnum('stage_id', [
  'discover',
  'normalize',
  'resolve_identity',
  'collect_evidence',
  'inspect_site',
  'find_contacts',
  'rank',
  'draft',
  'send',
]);

/**
 * `inconclusive` sits alongside `succeeded`, not alongside `failed`. The work
 * genuinely happened and genuinely produced uncertainty — that is a result, and
 * the whole pipeline is shaped around being able to say so.
 */
export const jobState = pgEnum('job_state', [
  'queued',
  'claimed',
  'running',
  'succeeded',
  'inconclusive',
  'failed',
  'cancelled_budget',
  'dead',
]);

export const inconclusiveReason = pgEnum('inconclusive_reason', [
  'blocked',
  'timeout',
  'no_data',
  'source_unavailable',
  'ambiguous',
]);

export const circuitState = pgEnum('circuit_state', ['closed', 'open', 'half_open']);

/** How often a saved search looks again. */
export const searchCadence = pgEnum('search_cadence', ['manual', 'daily', 'weekly', 'monthly']);

/* ── Outreach ────────────────────────────────────────────────────────────── */

export const campaignStatus = pgEnum('campaign_status', [
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'sending',
  'paused',
  'completed',
  'cancelled',
]);

export const campaignPauseReason = pgEnum('campaign_pause_reason', [
  'user_paused',
  'reply_received',
  'token_expired',
  'capability_absent',
  'evidence_expired',
  'subscription_inactive',
]);

/**
 * How a draft was produced. Unlike `evidenceOrigin`, `llm` IS allowed here —
 * a model may write outreach prose. It may not manufacture the facts that
 * prose rests on, which is enforced by the non-empty grounding constraint on
 * the same table.
 */
export const drafter = pgEnum('drafter', ['template', 'llm']);

export const sendStatus = pgEnum('send_status', [
  'pending',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'cancelled',
]);

export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound', 'manual_log']);

/**
 * Defaults to `unclassified` and is only ever set by the user. A polite brush-
 * off reads a lot like interest to a classifier, and guessing wrong here wastes
 * the user's time on exactly the conversations that were never going anywhere.
 */
export const replyIntent = pgEnum('reply_intent', [
  'unclassified',
  'interested',
  'not_now',
  'not_interested',
  'opt_out',
  'auto_reply',
]);

export const outcomeKind = pgEnum('outcome_kind', ['won', 'lost', 'quoted', 'qualified', 'stalled']);

/* ── Operations ──────────────────────────────────────────────────────────── */

export const suppressionScope = pgEnum('suppression_scope', [
  'email',
  'domain',
  'business',
  'handle',
]);

export const suppressionReason = pgEnum('suppression_reason', [
  'opt_out',
  'bounce',
  'manual',
  'complaint',
]);

/**
 * Balance is the sum of a ledger, never a mutated counter. Reserve debits,
 * finalise makes the debit permanent, refund credits it back — so a failed job
 * cannot quietly cost the user an assessment.
 */
export const ledgerKind = pgEnum('ledger_kind', [
  'reserve',
  'finalise',
  'refund',
  'grant',
  'expire',
]);

export const unitType = pgEnum('unit_type', ['deep_assessment', 'llm_draft', 'search_query']);

/**
 * `absent` is the honest state when billing is not configured — not a fake
 * `active`. It is rendered as a real product state.
 */
export const subscriptionStatus = pgEnum('subscription_status', [
  'absent',
  'trialing',
  'active',
  'past_due',
  'cancelled',
]);

export const blobBackend = pgEnum('blob_backend', ['fs', 's3']);
