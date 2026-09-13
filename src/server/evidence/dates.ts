/**
 * Reading dates out of a page, and being honest about how precisely.
 *
 * Acceptance case 5: "Old announcement discovered today: preserve its actual
 * event age." An announcement from March 2024 found this morning is two years
 * old. A prospecting tool that congratulates someone on a launch they held
 * eighteen months ago has done worse than nothing — and the way that happens is
 * quietly substituting the discovery date when no event date could be parsed.
 *
 * So parsing returns a PRECISION alongside the date. "March 2024" is not
 * "11 March 2024", and the UI must not imply otherwise.
 */

export type DatePrecision = 'day' | 'month' | 'quarter' | 'year' | 'unknown';

export type ParsedDate = {
  readonly date: Date;
  readonly precision: DatePrecision;
  /** The text this was read from, for the provenance chip. */
  readonly source: string;
};

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');

/**
 * Patterns, most precise first. Order matters: "14 August 2026" must match the
 * day-precision rule before the month-precision one sees "August 2026".
 */
const PATTERNS: readonly {
  readonly precision: DatePrecision;
  readonly regex: RegExp;
  readonly build: (match: RegExpMatchArray) => Date | null;
}[] = [
  {
    // ISO 8601: 2026-08-14
    precision: 'day',
    regex: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    build: (m) => makeDate(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  },
  {
    // 14 August 2026 / 14th August, 2026
    precision: 'day',
    regex: new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_NAMES})\.?,?\s+(\d{4})\b`, 'i'),
    build: (m) => makeDate(Number(m[3]), MONTHS[m[2]!.toLowerCase()] ?? 0, Number(m[1])),
  },
  {
    // August 14, 2026
    precision: 'day',
    regex: new RegExp(String.raw`\b(${MONTH_NAMES})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b`, 'i'),
    build: (m) => makeDate(Number(m[3]), MONTHS[m[1]!.toLowerCase()] ?? 0, Number(m[2])),
  },
  {
    // August 2026 — month precision, and it must stay month precision.
    precision: 'month',
    regex: new RegExp(String.raw`\b(${MONTH_NAMES})\.?\s+(\d{4})\b`, 'i'),
    build: (m) => makeDate(Number(m[2]), MONTHS[m[1]!.toLowerCase()] ?? 0, 1),
  },
  {
    // Q3 2026
    precision: 'quarter',
    regex: /\bQ([1-4])\s*,?\s*(\d{4})\b/i,
    build: (m) => makeDate(Number(m[2]), (Number(m[1]) - 1) * 3, 1),
  },
  {
    // A bare year. Deliberately last and deliberately imprecise.
    precision: 'year',
    regex: /\b(19|20)(\d{2})\b/,
    build: (m) => makeDate(Number(`${m[1]}${m[2]}`), 0, 1),
  },
];

function makeDate(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month, day));
  // Rejects 31 February and friends, which would otherwise roll silently into
  // the next month and produce a confidently wrong date.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month) return null;
  return date;
}

/** Parses the most precise date found in `text`, or null. */
export function parseDate(text: string): ParsedDate | null {
  for (const pattern of PATTERNS) {
    const match = text.match(pattern.regex);
    if (!match) continue;

    const date = pattern.build(match);
    if (date) {
      return { date, precision: pattern.precision, source: match[0] };
    }
  }
  return null;
}

/**
 * Finds a publication date from a page's own markup before falling back to
 * prose.
 *
 * `<time datetime>` and JSON-LD `datePublished` are the site telling us
 * directly; a date in body text is us inferring. When the markup disagrees with
 * the prose, the markup wins — but either way we know which one we used.
 */
export function extractPublishedDate(html: string): ParsedDate | null {
  const timeAttribute = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (timeAttribute?.[1]) {
    const parsed = parseDate(timeAttribute[1]);
    if (parsed) return parsed;
  }

  const jsonLd = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  if (jsonLd?.[1]) {
    const parsed = parseDate(jsonLd[1]);
    if (parsed) return parsed;
  }

  const metaPublished = html.match(
    /<meta[^>]+(?:property|name)=["'](?:article:published_time|date)["'][^>]+content=["']([^"']+)["']/i,
  );
  if (metaPublished?.[1]) {
    const parsed = parseDate(metaPublished[1]);
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Age in days, computed from the EVENT date.
 *
 * Named for what it must never be confused with. Returning null rather than
 * defaulting to zero is the point: an unknown age is unknown, and "0 days old"
 * would read as "brand new".
 */
export function eventAgeDays(eventDate: Date | null): number | null {
  if (!eventDate) return null;
  return Math.floor((Date.now() - eventDate.getTime()) / (24 * 60 * 60 * 1000));
}

/** Formats an age honestly, respecting how precisely the date was known. */
export function describeAge(eventDate: Date | null, precision: DatePrecision): string {
  if (!eventDate || precision === 'unknown') return 'date unknown';

  const days = eventAgeDays(eventDate) ?? 0;

  if (precision === 'year') return `in ${eventDate.getUTCFullYear()}`;
  if (precision === 'quarter' || precision === 'month') {
    const months = Math.max(0, Math.floor(days / 30));
    if (months < 1) return 'this month';
    if (months === 1) return 'about a month ago';
    if (months < 12) return `about ${months} months ago`;
    return `about ${Math.floor(months / 12)} year${months >= 24 ? 's' : ''} ago`;
  }

  if (days < 0) return 'upcoming';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} year${days >= 730 ? 's' : ''} ago`;
}

/** How long evidence of this kind stays usable for outreach. */
export function freshnessWindowDays(eventType: string): number {
  switch (eventType) {
    case 'funding':
    case 'opening':
    case 'rebrand':
      return 120;
    case 'collection_launch':
    case 'product_launch':
    case 'merch_drop':
      return 60;
    case 'hiring':
    case 'roster_change':
      return 45;
    default:
      return 90;
  }
}
