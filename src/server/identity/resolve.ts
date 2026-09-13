/**
 * RESOLVING WHO A BUSINESS ACTUALLY IS
 *
 * This is where prospecting tools most often go confidently wrong, and it is
 * the difference between evidence and guesswork. Three failures the brief calls
 * out specifically, and how the scoring below answers each:
 *
 *  1. A directory has no website field, so the tool reports "no website". We
 *     search, record what we searched, and return `none_found_after_search` —
 *     a claim we can defend — rather than an absence we inferred.
 *  2. Two businesses share a name, so the tool merges them. We raise a conflict
 *     and block outreach until a human resolves it.
 *  3. A domain merely resembles the name, so the tool accepts it. We weight
 *     RECIPROCAL evidence — the site linking back to the source that named it —
 *     far above name similarity, because name similarity is what a squatter has
 *     and a reciprocal link is what only the real owner has.
 */

export type IdentityStatus =
  | 'confirmed_official'
  | 'probable'
  | 'conflicting'
  | 'inaccessible'
  | 'none_found_after_search';

export type Confidence = 'high' | 'medium' | 'low';

export type IdentitySignal = {
  readonly signal: string;
  readonly weight: number;
  readonly detail: string;
  readonly evidenceId?: string;
};

/**
 * Signal weights.
 *
 * Reciprocity dominates deliberately. A matching name proves that someone chose
 * a similar string; a link back from the site to the directory entry that named
 * it proves the two parties know about each other.
 */
export const SIGNAL_WEIGHTS = {
  /** The candidate site links back to the source that named the business. */
  reciprocal_link: 40,
  /** A verified social profile links to this domain. */
  social_profile_match: 25,
  /** The business name appears in the page title or an h1. */
  brand_name_in_title: 15,
  /** Structured data names the organisation. */
  structured_data_name: 20,
  /** The domain is a close match for the business name. */
  domain_name_similarity: 10,
  /** A regional TLD matching the business's country. */
  regional_tld: 5,
  /** A shared address, phone number or registration number. */
  contact_detail_match: 20,
  /** The page names a DIFFERENT business — strong negative. */
  conflicting_name: -35,
  /** The site is a parked domain or for-sale page. */
  parked_domain: -40,
} as const;

export type SignalName = keyof typeof SIGNAL_WEIGHTS;

export function signal(
  name: SignalName,
  detail: string,
  evidenceId?: string,
): IdentitySignal {
  return {
    signal: name,
    weight: SIGNAL_WEIGHTS[name],
    detail,
    ...(evidenceId ? { evidenceId } : {}),
  };
}

/** Lowercased, punctuation-stripped, suffix-free. Used for collision detection. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(
      /\b(?:ltd|limited|llc|inc|incorporated|gmbh|bv|nv|sarl|sas|srl|plc|co|company|corp|corporation|the|and|&)\b/g,
      '',
    )
    .replace(/[^a-z0-9]/g, '');
}

/** Compares a domain to a business name, ignoring the TLD and separators. */
export function domainResemblesName(domain: string, name: string): boolean {
  const host = domain.replace(/^www\./, '').split('.')[0] ?? '';
  const normalisedHost = host.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const normalisedName = nameKey(name);

  if (!normalisedHost || !normalisedName) return false;

  return (
    normalisedHost === normalisedName ||
    normalisedHost.includes(normalisedName) ||
    normalisedName.includes(normalisedHost)
  );
}

export type ResolutionInput = {
  readonly signals: readonly IdentitySignal[];
  /** Which searches were actually performed. Makes absence defensible. */
  readonly searchedVia: readonly string[];
  /** True when the site could not be reached at all. */
  readonly inaccessible?: boolean;
  /** True when a candidate URL was found at all. */
  readonly hasCandidate: boolean;
};

export type Resolution = {
  readonly status: IdentityStatus;
  readonly confidence: Confidence;
  readonly score: number;
  readonly signals: readonly IdentitySignal[];
  /** Plain-language summary, shown next to the status in the UI. */
  readonly explanation: string;
};

/**
 * Thresholds.
 *
 * `confirmed_official` is set high enough that name similarity alone can never
 * reach it: 10 (similarity) + 15 (title) + 5 (TLD) = 30, below the bar. Getting
 * to confirmed requires reciprocity, structured data or a contact match — some
 * piece of evidence that a squatted or coincidental domain would not have.
 */
export const CONFIRMED_THRESHOLD = 45;
export const PROBABLE_THRESHOLD = 20;

export function resolveIdentity(input: ResolutionInput): Resolution {
  const score = input.signals.reduce((total, item) => total + item.weight, 0);

  if (!input.hasCandidate) {
    return {
      status: 'none_found_after_search',
      confidence: input.searchedVia.length > 0 ? 'medium' : 'low',
      score: 0,
      signals: input.signals,
      explanation:
        input.searchedVia.length > 0
          ? `No official site found after searching ${input.searchedVia.join(', ')}. This is not evidence that none exists.`
          : 'No search has been performed yet.',
    };
  }

  if (input.inaccessible) {
    return {
      status: 'inaccessible',
      confidence: 'low',
      score,
      signals: input.signals,
      explanation:
        'A candidate site was found but could not be read, so it has not been confirmed either way.',
    };
  }

  const conflicting = input.signals.filter(
    (item) => item.signal === 'conflicting_name' || item.signal === 'parked_domain',
  );

  if (conflicting.length > 0 && score < PROBABLE_THRESHOLD) {
    return {
      status: 'conflicting',
      confidence: 'low',
      score,
      signals: input.signals,
      explanation: `The site does not appear to belong to this business: ${conflicting
        .map((item) => item.detail)
        .join('; ')}.`,
    };
  }

  if (score >= CONFIRMED_THRESHOLD) {
    return {
      status: 'confirmed_official',
      confidence: 'high',
      score,
      signals: input.signals,
      explanation: `Confirmed by ${input.signals
        .filter((item) => item.weight > 0)
        .map((item) => item.detail)
        .join('; ')}.`,
    };
  }

  if (score >= PROBABLE_THRESHOLD) {
    return {
      status: 'probable',
      confidence: 'medium',
      score,
      signals: input.signals,
      explanation:
        'This is probably the right site, but nothing links it back to the business definitively. Worth a glance before you write.',
    };
  }

  return {
    status: 'none_found_after_search',
    confidence: 'low',
    score,
    signals: input.signals,
    explanation: `A candidate was found but the evidence was too weak to accept it${
      input.searchedVia.length > 0 ? ` (searched ${input.searchedVia.join(', ')})` : ''
    }.`,
  };
}

/**
 * Do two records describe the same business?
 *
 * Returning `conflict` rather than guessing is the whole point. A same-name,
 * different-region pair is exactly the case that must reach a human — merging
 * is unrecoverable, and emailing the wrong company about a competitor's
 * website is a mistake the user cannot take back.
 */
export type MatchVerdict =
  | { readonly kind: 'same'; readonly reason: string }
  | { readonly kind: 'distinct'; readonly reason: string }
  | { readonly kind: 'conflict'; readonly reason: string };

export function compareBusinesses(
  a: { name: string; domain?: string | null; country?: string | null; region?: string | null },
  b: { name: string; domain?: string | null; country?: string | null; region?: string | null },
): MatchVerdict {
  const sameDomain = Boolean(a.domain && b.domain && a.domain === b.domain);
  if (sameDomain) {
    return { kind: 'same', reason: 'Both records resolve to the same confirmed domain.' };
  }

  const sameName = nameKey(a.name) === nameKey(b.name);
  if (!sameName) {
    return { kind: 'distinct', reason: 'The names do not match.' };
  }

  // Same name, different confirmed domains: two businesses, not one.
  if (a.domain && b.domain && a.domain !== b.domain) {
    return {
      kind: 'conflict',
      reason: `Two businesses named "${a.name}" with different websites (${a.domain} and ${b.domain}).`,
    };
  }

  const bothLocated = Boolean((a.country || a.region) && (b.country || b.region));
  const sameCountry = a.country && b.country && a.country === b.country;
  const sameRegion = a.region && b.region && a.region === b.region;

  if (bothLocated && !sameCountry && !sameRegion) {
    return {
      kind: 'conflict',
      reason: `Two businesses named "${a.name}" in different places (${a.region ?? a.country} and ${b.region ?? b.country}).`,
    };
  }

  if (sameRegion) {
    return {
      kind: 'conflict',
      reason: `Two records named "${a.name}" in the same area — they may be one business or two.`,
    };
  }

  return {
    kind: 'conflict',
    reason: `Two records share the name "${a.name}" and there is not enough information to tell them apart.`,
  };
}
