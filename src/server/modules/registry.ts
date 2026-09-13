import type { CapabilityId } from '../capabilities/registry';

/**
 * THE SEVEN INDUSTRY MODULES
 *
 * All seven are declared. Two are built. The other five say so.
 *
 * That asymmetry is the honest position, and stating it is the whole point.
 * Without a search provider configured, five of these have no live discovery
 * source at all — and a module that silently returned nothing would look
 * identical to an industry with no prospects in it. The brief requires each
 * module to declare its coverage; this is that declaration, rendered verbatim
 * on the research setup screen rather than summarised.
 */

export type ModuleId =
  | 'fashion'
  | 'creators'
  | 'hospitality'
  | 'local_services'
  | 'professional'
  | 'software'
  | 'esports';

export type ModuleFilter = {
  readonly key: string;
  readonly label: string;
  readonly kind: 'select' | 'toggle' | 'text';
  readonly options?: readonly string[];
  readonly hint?: string;
};

export type NicheModule = {
  readonly id: ModuleId;
  readonly label: string;
  /** What a prospect in this industry looks like. */
  readonly description: string;
  /** What makes one worth approaching now. */
  readonly reasonsToInvestigate: readonly string[];
  /** What the assessment actually checks, and what it refuses to conclude. */
  readonly assessmentFocus: string;
  /** Filters shown only when this module is selected. */
  readonly filters: readonly ModuleFilter[];
  /**
   * Built means: assessment rules exist, benchmark cases pass, and the module
   * has been exercised against real sites. Declared-only modules share the
   * evidence and identity machinery but have no tuned rules of their own.
   */
  readonly built: boolean;
  /** Sources that can actually find prospects for this module today. */
  readonly discoveryCapabilities: readonly CapabilityId[];
  /** Verbatim on the setup screen. Never softened. */
  readonly coverageNote: string;
};

export const MODULES: readonly NicheModule[] = [
  {
    id: 'local_services',
    label: 'Local services',
    description:
      'Trades, clinics, studios and shops serving a defined area — the businesses most likely to be running a site nobody has touched in three years.',
    reasonsToInvestigate: [
      'A new location or service line',
      'An opening announcement',
      'No working way to request a quote',
    ],
    assessmentFocus:
      'Service-area clarity, a reachable contact or booking route, and whether the site works on a phone. Domains are verified beyond the directory field, because directory listings are frequently wrong.',
    filters: [
      { key: 'radius', label: 'Within', kind: 'select', options: ['5 km', '25 km', '50 km', 'Any'] },
      {
        key: 'has_storefront',
        label: 'Physical premises only',
        kind: 'toggle',
        hint: 'Excludes businesses that operate entirely online.',
      },
    ],
    built: true,
    discoveryCapabilities: ['manual_url_import', 'web_search_discovery'],
    coverageNote:
      'Fully built: assessment rules, benchmark cases and real-site testing. Discovery beyond your own imported URLs needs a search provider.',
  },
  {
    id: 'fashion',
    label: 'Fashion and ecommerce',
    description:
      'Brands selling their own products, whether through their own checkout or a platform.',
    reasonsToInvestigate: [
      'A collection launch',
      'A new wholesale or stockist channel',
      'Selling only through social',
      'A rebrand',
    ],
    assessmentFocus:
      'Product discovery on mobile, size and fit information, and whether the purchase journey completes. A working Shopify or Etsy storefront is a functioning commercial route, not a missing one.',
    filters: [
      {
        key: 'platform',
        label: 'Storefront',
        kind: 'select',
        options: ['Any', 'Own checkout', 'Third-party platform', 'Social only'],
      },
      { key: 'wholesale', label: 'Sells wholesale', kind: 'toggle' },
    ],
    built: true,
    discoveryCapabilities: ['manual_url_import', 'web_search_discovery'],
    coverageNote:
      'Fully built: assessment rules, benchmark cases and real-site testing. Discovery beyond your own imported URLs needs a search provider.',
  },
  {
    id: 'hospitality',
    label: 'Hospitality and venues',
    description: 'Restaurants, bars, hotels and event spaces.',
    reasonsToInvestigate: ['A new opening', 'An event programme', 'A rebrand'],
    assessmentFocus:
      'Menu, booking and event information on a phone. A venue booking through OpenTable or Resy has a working booking route — reporting that as a defect is the classic false positive here.',
    filters: [
      {
        key: 'venue_type',
        label: 'Venue type',
        kind: 'select',
        options: ['Any', 'Restaurant', 'Bar', 'Hotel', 'Event space'],
      },
    ],
    built: false,
    discoveryCapabilities: ['manual_url_import', 'web_search_discovery'],
    coverageNote:
      'Declared, not built. Shares the evidence, identity and inspection machinery, but has no tuned assessment rules or benchmark cases yet. Import URLs and the general checks still apply.',
  },
  {
    id: 'professional',
    label: 'Professional services',
    description: 'Consultancies, agencies, legal and accounting practices.',
    reasonsToInvestigate: [
      'A new practice or specialisation',
      'Team growth',
      'A rebrand',
    ],
    assessmentFocus:
      'How clearly expertise and credibility are presented, and whether an enquiry path exists. Confidential client details and financial position are never inferred.',
    filters: [
      { key: 'headcount', label: 'Team size', kind: 'select', options: ['Any', '1–5', '6–20', '20+'] },
    ],
    built: false,
    discoveryCapabilities: ['manual_url_import', 'web_search_discovery'],
    coverageNote:
      'Declared, not built. Shares the evidence, identity and inspection machinery, but has no tuned assessment rules or benchmark cases yet.',
  },
  {
    id: 'software',
    label: 'Software and startups',
    description: 'Product companies and early-stage teams.',
    reasonsToInvestigate: ['A product launch', 'New positioning', 'A funding announcement'],
    assessmentFocus:
      'Whether the product is explained, whether a demo or signup path exists, and brand consistency. Funding is context, never a promised website budget.',
    filters: [
      {
        key: 'stage',
        label: 'Stage',
        kind: 'select',
        options: ['Any', 'Pre-seed', 'Seed', 'Series A+'],
      },
    ],
    built: false,
    discoveryCapabilities: ['manual_url_import', 'web_search_discovery'],
    coverageNote:
      'Declared, not built. Shares the evidence, identity and inspection machinery, but has no tuned assessment rules or benchmark cases yet.',
  },
  {
    id: 'creators',
    label: 'Creators and independent media',
    description: 'Independent publishers, channels and course sellers.',
    reasonsToInvestigate: [
      'A course or product launch',
      'Sponsorship activity',
      'Commercial links scattered across platforms',
    ],
    assessmentFocus:
      'Offer clarity and whether there is an owned destination rather than only platform profiles. Subscriber counts are not evidence of budget.',
    filters: [
      {
        key: 'platform',
        label: 'Primary platform',
        kind: 'select',
        options: ['Any', 'YouTube', 'Newsletter', 'Podcast', 'Twitch'],
      },
    ],
    built: false,
    discoveryCapabilities: ['manual_url_import'],
    coverageNote:
      'Declared, not built, and with no discovery source beyond your own imported URLs. Creator platforms need API access that has not been arranged.',
  },
  {
    id: 'esports',
    label: 'Esports and gaming',
    description: 'Teams, organizations and tournament operators.',
    reasonsToInvestigate: [
      'Team expansion',
      'A jersey or merchandise drop',
      'A rebrand',
      'A new sponsor',
    ],
    assessmentFocus:
      'Parent organization identity, and how roster, partner and shop information is presented. An independent squad is distinguished from a funded organization rather than assumed equivalent.',
    filters: [
      { key: 'tier', label: 'Tier', kind: 'select', options: ['Any', 'Tier 1', 'Tier 2', 'Amateur'] },
    ],
    built: false,
    discoveryCapabilities: ['manual_url_import'],
    coverageNote:
      'Declared, not built, and with no discovery source beyond your own imported URLs. Tournament and roster sources need access that has not been arranged.',
  },
];

export function getModule(id: ModuleId): NicheModule {
  const found = MODULES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown module: ${id}`);
  return found;
}

export const BUILT_MODULES = MODULES.filter((entry) => entry.built);
