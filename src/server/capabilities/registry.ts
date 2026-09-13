/**
 * THE CAPABILITY REGISTRY
 *
 * The single source of truth for what Kovvi can actually do right now.
 *
 * The brief's rule is that an unsupported integration must be "explicitly
 * absent rather than simulated". This registry is how that becomes mechanical:
 * the pipeline, the product UI and the marketing page all read from here, so
 * the landing page cannot advertise a channel the pipeline cannot use, and the
 * pipeline cannot quietly produce output for a provider that was never
 * configured.
 *
 * A capability is derived from the environment ALONE. There is no override, no
 * "demo mode", and no code path anywhere that fabricates a result when a
 * capability is absent — `tests/guard/capability-honesty.test.ts` runs the
 * whole pipeline with every optional credential unset and proves it.
 *
 * Absence is a designed product state, not an error. A user who has not
 * connected an email provider still gets everything up to an approved
 * campaign, plus "copy message" and "log manual send" — which is a genuinely
 * complete workflow, just a manual one.
 */

export type CapabilityId =
  | 'manual_url_import'
  | 'public_web_fetch'
  | 'website_inspection'
  | 'contact_extraction'
  | 'template_drafting'
  | 'capture_storage'
  | 'llm_drafting'
  | 'web_search_discovery'
  | 'email_sending'
  | 'billing'
  | 'object_storage_s3';

export type CapabilityState =
  /** Configured and usable. */
  | { readonly state: 'live' }
  /** Coded and tested, but its credentials are not present. */
  | { readonly state: 'absent'; readonly missing: readonly string[] }
  /** Configured, but failing — usually an open circuit breaker. */
  | { readonly state: 'degraded'; readonly detail: string };

export type Capability = {
  readonly id: CapabilityId;
  readonly label: string;
  /** What the user gets when this IS available. */
  readonly provides: string;
  /**
   * What happens when it is not. Shown verbatim in the UI, so it must be
   * honest about the loss rather than reassuring.
   */
  readonly withoutIt: string;
  /** Environment variables required. Empty means it needs no credentials. */
  readonly requires: readonly string[];
  /** Where the user gets the credentials, when there are any. */
  readonly setupUrl?: string;
};

export const CAPABILITIES: readonly Capability[] = [
  /* ── Live with zero setup ─────────────────────────────────────────────── */
  {
    id: 'manual_url_import',
    label: 'Manual URL import',
    provides: 'Add prospects by pasting URLs or uploading a CSV.',
    withoutIt: 'Always available.',
    requires: [],
  },
  {
    id: 'public_web_fetch',
    label: 'Public page retrieval',
    provides: 'Fetches public pages to gather evidence, with SSRF protection.',
    withoutIt: 'Always available.',
    requires: [],
  },
  {
    id: 'website_inspection',
    label: 'Website inspection',
    provides:
      'Loads a confirmed site in a real browser: desktop and mobile captures, redirect chain, navigation, and the purchase or contact route.',
    withoutIt: 'Always available.',
    requires: [],
  },
  {
    id: 'contact_extraction',
    label: 'Public contact extraction',
    provides: 'Finds publicly listed contact routes and records where each came from.',
    withoutIt: 'Always available.',
    requires: [],
  },
  {
    id: 'template_drafting',
    label: 'Template drafting',
    provides: 'Drafts outreach from templates, grounded in the evidence on file.',
    withoutIt: 'Always available.',
    requires: [],
  },
  {
    id: 'capture_storage',
    label: 'Screenshot storage',
    provides: 'Stores captures on the local filesystem.',
    withoutIt: 'Always available.',
    requires: [],
  },

  /* ── Gated on the user's own credentials ──────────────────────────────── */
  {
    id: 'llm_drafting',
    label: 'AI-assisted drafting',
    provides: 'Writes outreach in your tone, citing the same evidence.',
    withoutIt:
      'Drafting falls back to templates. They work and are grounded in the same evidence — they are simply less fluent. Nothing is fabricated in either mode.',
    requires: ['ANTHROPIC_API_KEY'],
    setupUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'web_search_discovery',
    label: 'Web search discovery',
    provides: 'Finds candidate businesses from public search and directory sources.',
    withoutIt:
      'Discovery is limited to URLs and CSVs you import yourself. Research runs record the source as unavailable and show partial coverage, rather than returning a shorter list that looks complete.',
    requires: ['SEARCH_API_PROVIDER', 'SEARCH_API_KEY'],
  },
  {
    id: 'email_sending',
    label: 'Email sending',
    provides: 'Sends approved campaigns, with suppression and automatic reply-stop.',
    withoutIt:
      'Campaigns work fully up to approval. Sending is replaced by "copy message" and "log manual send"; suppression and reply-stop still apply to what you log.',
    requires: ['RESEND_API_KEY', 'KOVVI_SENDING_DOMAIN'],
    setupUrl: 'https://resend.com/api-keys',
  },
  {
    id: 'billing',
    label: 'Subscription billing',
    provides: 'Checkout, renewal and cancellation.',
    withoutIt:
      'Subscription status reads "not connected". Plan allowances still apply, so usage is metered for real.',
    requires: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    setupUrl: 'https://dashboard.stripe.com/apikeys',
  },
  {
    id: 'object_storage_s3',
    label: 'S3 capture storage',
    provides: 'Stores captures in object storage, for deployments without a durable disk.',
    withoutIt: 'Captures are stored on the local filesystem behind the same interface.',
    requires: ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
  },
] as const;

const BY_ID = new Map(CAPABILITIES.map((capability) => [capability.id, capability]));

export function getCapability(id: CapabilityId): Capability {
  const capability = BY_ID.get(id);
  if (!capability) throw new Error(`Unknown capability: ${id}`);
  return capability;
}

/**
 * Resolves a capability's state from the environment.
 *
 * Callers in a Next.js page or route MUST `await connection()` first, or Next
 * prerenders the answer at build time and the page reports whatever was
 * configured on the build machine — permanently.
 */
export function capabilityState(id: CapabilityId): CapabilityState {
  const capability = getCapability(id);

  const missing = capability.requires.filter((name) => !process.env[name]);
  if (missing.length > 0) return { state: 'absent', missing };

  return { state: 'live' };
}

export function isLive(id: CapabilityId): boolean {
  return capabilityState(id).state === 'live';
}

export type ResolvedCapability = Capability & { readonly status: CapabilityState };

/** The whole registry with current states. Rendered by settings and marketing. */
export function resolveAllCapabilities(): readonly ResolvedCapability[] {
  return CAPABILITIES.map((capability) => ({
    ...capability,
    status: capabilityState(capability.id),
  }));
}

/**
 * Thrown when code reaches a capability that is not available.
 *
 * The pipeline converts this into `inconclusive('source_unavailable')` and
 * server actions into a typed result the UI renders as a designed state — it is
 * never an exception page, and never a silently empty result.
 */
export class CapabilityAbsentError extends Error {
  constructor(
    readonly capabilityId: CapabilityId,
    readonly missing: readonly string[],
  ) {
    const capability = getCapability(capabilityId);
    super(
      `${capability.label} is not connected (missing: ${missing.join(', ')}). ` +
        `Without it: ${capability.withoutIt}`,
    );
    this.name = 'CapabilityAbsentError';
  }
}

/** Asserts a capability is usable, or throws `CapabilityAbsentError`. */
export function requireCapability(id: CapabilityId): void {
  const status = capabilityState(id);
  if (status.state === 'absent') throw new CapabilityAbsentError(id, status.missing);
  if (status.state === 'degraded') throw new CapabilityAbsentError(id, []);
}
