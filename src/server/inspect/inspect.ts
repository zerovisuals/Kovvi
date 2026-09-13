import type { Browser, BrowserContext, Page } from 'playwright';
import { assertPublicTarget, UnsafeTargetError } from '@/lib/net/ssrf';
import { USER_AGENT } from '@/lib/net/safe-fetch';
import { launchChromium } from './chromium';

/**
 * WEBSITE INSPECTION
 *
 * Loading a stranger's website in a real browser, and reporting only what was
 * actually observed.
 *
 * The governing rule is acceptance case 4: if we could not see the site, we say
 * so and produce ZERO findings. A blocked crawl tells us nothing about a
 * website's quality, and "we couldn't check" reported as "it's broken" is the
 * single most damaging thing this product could get wrong — it would put a
 * false accusation into an email the user sends under their own name.
 *
 * Three things are load-bearing:
 *
 *  1. `context.route('**')` validates EVERY subresource against the same SSRF
 *     policy as the top-level fetch. The page's own JavaScript can request
 *     anything it likes; without this, the SSRF guard protects only the URL we
 *     typed and not the hundred the page fetches afterwards.
 *  2. Nothing is ever submitted. No form is filled, no button clicked, no order
 *     placed. Contact-route detection is STRUCTURAL — does a reachable page
 *     contain a form with an email field — never behavioural.
 *  3. A third-party checkout or booking platform is a working commercial
 *     journey, not a missing one (acceptance case 14).
 */

export const ENGINE_VERSION = 'inspect/1';

export const INSPECTION_LIMITS = {
  /** Whole-assessment budget. Past this the result is inconclusive, not failed. */
  totalMs: 45_000,
  /** Per-navigation. */
  navigationMs: 20_000,
  maxPages: 12,
  maxDepth: 2,
} as const;

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type InspectionOutcome =
  | 'complete'
  | 'partial'
  | 'inconclusive_blocked'
  | 'inconclusive_timeout'
  | 'failed';

export type PageObservation = {
  readonly url: string;
  readonly status: number | null;
  readonly title: string | null;
  readonly depth: number;
  /** Internal links found, already normalised and same-site filtered. */
  readonly internalLinks: readonly string[];
  readonly hasContactForm: boolean;
  readonly emailLinks: readonly string[];
  readonly telLinks: readonly string[];
  /** Third-party commerce or booking destinations linked from this page. */
  readonly externalProviders: readonly ExternalProvider[];
  readonly headingCount: number;
  readonly wordCount: number;
  /** True when a horizontal scrollbar appears at mobile width. */
  readonly overflowsAtMobile: boolean;
  readonly viewportMetaPresent: boolean;
  readonly structuredDataTypes: readonly string[];
};

export type ExternalProvider = {
  readonly kind: 'shop' | 'booking' | 'ticketing' | 'social_shop' | 'scheduling';
  readonly provider: string;
  readonly url: string;
};

export type Capture = {
  readonly viewport: 'desktop' | 'mobile';
  readonly url: string;
  readonly png: Buffer;
  readonly width: number;
  readonly height: number;
};

export type InspectionResult = {
  readonly outcome: InspectionOutcome;
  readonly engineVersion: string;
  /** Populated for every inconclusive outcome, explaining what stopped us. */
  readonly inconclusiveDetail?: string;
  readonly startUrl: string;
  readonly finalUrl: string | null;
  readonly status: number | null;
  readonly redirectChain: readonly string[];
  readonly pages: readonly PageObservation[];
  readonly captures: readonly Capture[];
  readonly startedAt: Date;
  readonly finishedAt: Date;
};

/**
 * Known third-party commerce and booking platforms.
 *
 * Recognising these is the difference between "this restaurant has no way to
 * take a booking" and "this restaurant books through OpenTable". The first is a
 * false accusation; both look identical to a checker that only counts forms.
 */
const EXTERNAL_PROVIDERS: readonly {
  readonly pattern: RegExp;
  readonly kind: ExternalProvider['kind'];
  readonly provider: string;
}[] = [
  { pattern: /(?:^|\.)shopify\.com$/i, kind: 'shop', provider: 'Shopify' },
  { pattern: /(?:^|\.)myshopify\.com$/i, kind: 'shop', provider: 'Shopify' },
  { pattern: /(?:^|\.)squarespace\.com$/i, kind: 'shop', provider: 'Squarespace' },
  { pattern: /(?:^|\.)bigcartel\.com$/i, kind: 'shop', provider: 'Big Cartel' },
  { pattern: /(?:^|\.)etsy\.com$/i, kind: 'shop', provider: 'Etsy' },
  { pattern: /(?:^|\.)gumroad\.com$/i, kind: 'shop', provider: 'Gumroad' },
  { pattern: /(?:^|\.)stripe\.com$/i, kind: 'shop', provider: 'Stripe Checkout' },
  { pattern: /(?:^|\.)opentable\./i, kind: 'booking', provider: 'OpenTable' },
  { pattern: /(?:^|\.)thefork\./i, kind: 'booking', provider: 'TheFork' },
  { pattern: /(?:^|\.)resy\.com$/i, kind: 'booking', provider: 'Resy' },
  { pattern: /(?:^|\.)sevenrooms\.com$/i, kind: 'booking', provider: 'SevenRooms' },
  { pattern: /(?:^|\.)booking\.com$/i, kind: 'booking', provider: 'Booking.com' },
  { pattern: /(?:^|\.)eventbrite\./i, kind: 'ticketing', provider: 'Eventbrite' },
  { pattern: /(?:^|\.)dice\.fm$/i, kind: 'ticketing', provider: 'DICE' },
  { pattern: /(?:^|\.)calendly\.com$/i, kind: 'scheduling', provider: 'Calendly' },
  { pattern: /(?:^|\.)cal\.com$/i, kind: 'scheduling', provider: 'Cal.com' },
  { pattern: /(?:^|\.)squareup\.com$/i, kind: 'booking', provider: 'Square' },
  { pattern: /(?:^|\.)instagram\.com$/i, kind: 'social_shop', provider: 'Instagram' },
];

function classifyExternal(href: string): ExternalProvider | null {
  try {
    const host = new URL(href).hostname;
    for (const candidate of EXTERNAL_PROVIDERS) {
      if (candidate.pattern.test(host)) {
        return { kind: candidate.kind, provider: candidate.provider, url: href };
      }
    }
  } catch {
    // A malformed href is not an external provider.
  }
  return null;
}

/** Same registrable site, ignoring `www.` — good enough without a PSL dependency. */
function sameSite(a: string, b: string): boolean {
  try {
    const hostA = new URL(a).hostname.replace(/^www\./, '');
    const hostB = new URL(b).hostname.replace(/^www\./, '');
    return hostA === hostB;
  } catch {
    return false;
  }
}

/**
 * Applies the SSRF policy to every request the page makes, not just the one we
 * initiated. Without this the guard covers the front door and leaves every
 * window open.
 */
async function guardContext(context: BrowserContext): Promise<void> {
  /**
   * esbuild (via tsx, and in some bundler configurations) rewrites nested
   * function declarations to call a `__name` helper for stack-trace fidelity.
   * Playwright serialises our evaluate callbacks as source, so that helper
   * travels with them into a page that has never heard of it, and every
   * `page.evaluate` throws `__name is not defined`.
   *
   * Defining an identity shim before any page script runs costs nothing and
   * makes the observation code independent of how it was compiled.
   */
  await context.addInitScript(() => {
    const scope = globalThis as unknown as { __name?: (fn: unknown) => unknown };
    scope.__name ??= (fn: unknown) => fn;
  });

  await context.route('**/*', async (route) => {
    const url = route.request().url();

    // Non-network schemes the browser handles itself and cannot leak with.
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
      await route.continue();
      return;
    }

    try {
      await assertPublicTarget(url);
      await route.continue();
    } catch (error) {
      if (error instanceof UnsafeTargetError) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.abort('failed');
    }
  });
}

async function observePage(page: Page, depth: number, status: number | null): Promise<PageObservation> {
  return page.evaluate(
    ({ depth: currentDepth, status: httpStatus }) => {
      const absolute = (href: string): string | null => {
        try {
          return new URL(href, document.baseURI).href;
        } catch {
          return null;
        }
      };

      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const links: string[] = [];
      const emails: string[] = [];
      const tels: string[] = [];
      const external: string[] = [];

      for (const anchor of anchors) {
        const raw = anchor.getAttribute('href') ?? '';

        if (raw.startsWith('mailto:')) {
          emails.push(raw.slice(7).split('?')[0] ?? '');
          continue;
        }
        if (raw.startsWith('tel:')) {
          tels.push(raw.slice(4));
          continue;
        }
        if (raw.startsWith('javascript:') || raw.startsWith('#')) continue;

        const href = absolute(raw);
        if (!href) continue;

        if (href.startsWith('http')) {
          links.push(href);
          external.push(href);
        }
      }

      // Structural contact detection only. A form containing an email field is
      // a contact route; we never fill or submit one to find out.
      const forms = Array.from(document.querySelectorAll('form'));
      const hasContactForm = forms.some((form) =>
        Array.from(form.querySelectorAll('input, textarea')).some((field) => {
          const type = field.getAttribute('type')?.toLowerCase() ?? '';
          const name = `${field.getAttribute('name') ?? ''} ${field.getAttribute('id') ?? ''} ${
            field.getAttribute('placeholder') ?? ''
          }`.toLowerCase();
          return (
            type === 'email' ||
            /e-?mail|message|enquir|inquir|contact|naam|nombre/.test(name) ||
            field.tagName === 'TEXTAREA'
          );
        }),
      );

      const structuredDataTypes: string[] = [];
      for (const script of Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      )) {
        try {
          const parsed: unknown = JSON.parse(script.textContent ?? '');
          const entries = Array.isArray(parsed) ? parsed : [parsed];
          for (const entry of entries) {
            const type = (entry as { '@type'?: unknown })?.['@type'];
            if (typeof type === 'string') structuredDataTypes.push(type);
          }
        } catch {
          // Malformed JSON-LD is common and not worth failing an inspection over.
        }
      }

      return {
        url: window.location.href,
        status: httpStatus,
        title: document.title || null,
        depth: currentDepth,
        internalLinks: links,
        hasContactForm,
        emailLinks: emails.filter(Boolean),
        telLinks: tels,
        externalCandidates: external,
        headingCount: document.querySelectorAll('h1, h2, h3').length,
        wordCount: (document.body?.innerText ?? '').trim().split(/\s+/).filter(Boolean).length,
        overflowsAtMobile:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        viewportMetaPresent: Boolean(document.querySelector('meta[name="viewport"]')),
        structuredDataTypes,
      };
    },
    { depth, status },
  ).then((raw) => {
    const externalProviders: ExternalProvider[] = [];
    const seen = new Set<string>();

    for (const href of raw.externalCandidates) {
      const provider = classifyExternal(href);
      if (provider && !seen.has(provider.provider)) {
        seen.add(provider.provider);
        externalProviders.push(provider);
      }
    }

    const internalLinks = raw.internalLinks.filter((href) => sameSite(href, raw.url));

    return {
      url: raw.url,
      status: raw.status,
      title: raw.title,
      depth: raw.depth,
      internalLinks: [...new Set(internalLinks)],
      hasContactForm: raw.hasContactForm,
      emailLinks: [...new Set(raw.emailLinks)],
      telLinks: [...new Set(raw.telLinks)],
      externalProviders,
      headingCount: raw.headingCount,
      wordCount: raw.wordCount,
      overflowsAtMobile: raw.overflowsAtMobile,
      viewportMetaPresent: raw.viewportMetaPresent,
      structuredDataTypes: [...new Set(raw.structuredDataTypes)],
    };
  });
}

/**
 * Inspects one website.
 *
 * Accepts an optional browser so a worker can reuse a single instance across
 * jobs; otherwise it launches and closes its own.
 */
export async function inspectWebsite(
  startUrl: string,
  options: { readonly browser?: Browser; readonly maxPages?: number } = {},
): Promise<InspectionResult> {
  const startedAt = new Date();
  const deadline = Date.now() + INSPECTION_LIMITS.totalMs;
  const maxPages = options.maxPages ?? INSPECTION_LIMITS.maxPages;

  const base = {
    engineVersion: ENGINE_VERSION,
    startUrl,
    startedAt,
  };

  try {
    await assertPublicTarget(startUrl);
  } catch (error) {
    return {
      ...base,
      outcome: 'failed',
      inconclusiveDetail: error instanceof Error ? error.message : 'unsafe target',
      finalUrl: null,
      status: null,
      redirectChain: [],
      pages: [],
      captures: [],
      finishedAt: new Date(),
    };
  }

  const ownBrowser = options.browser ?? (await launchChromium());
  const context = await ownBrowser.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORTS.desktop,
    // A prospect's site must not be able to hand us a file.
    acceptDownloads: false,
    serviceWorkers: 'block',
    javaScriptEnabled: true,
    locale: 'en-GB',
  });

  const pages: PageObservation[] = [];
  const captures: Capture[] = [];
  const redirectChain: string[] = [];
  let finalUrl: string | null = null;
  let status: number | null = null;
  let outcome: InspectionOutcome = 'complete';
  let inconclusiveDetail: string | undefined;

  try {
    await guardContext(context);

    const page = await context.newPage();
    page.on('dialog', (dialog) => void dialog.dismiss());
    page.on('response', (response) => {
      if (response.status() >= 300 && response.status() < 400) {
        redirectChain.push(response.url());
      }
    });

    const response = await page.goto(startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: INSPECTION_LIMITS.navigationMs,
    });

    status = response?.status() ?? null;
    finalUrl = page.url();

    // The site turned us away. This is a fact about access, and it means we
    // learned nothing about the website — so we report exactly that, with no
    // findings attached.
    if (status === 401 || status === 403 || status === 429) {
      return {
        ...base,
        outcome: 'inconclusive_blocked',
        inconclusiveDetail: `The site responded ${status} to an automated request. Nothing was assessed.`,
        finalUrl,
        status,
        redirectChain,
        pages: [],
        captures: [],
        finishedAt: new Date(),
      };
    }

    if (status !== null && status >= 500) {
      return {
        ...base,
        outcome: 'inconclusive_blocked',
        inconclusiveDetail: `The site returned ${status}. That is a server problem at the time of checking, not a finding about the website.`,
        finalUrl,
        status,
        redirectChain,
        pages: [],
        captures: [],
        finishedAt: new Date(),
      };
    }

    /* ── Crawl breadth-first to the depth limit ───────────────────────────── */
    const queue: { url: string; depth: number }[] = [{ url: finalUrl, depth: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0 && pages.length < maxPages) {
      if (Date.now() > deadline) {
        outcome = pages.length > 0 ? 'partial' : 'inconclusive_timeout';
        inconclusiveDetail = `Stopped after ${INSPECTION_LIMITS.totalMs / 1000}s. ${
          pages.length
        } page(s) were assessed before the limit.`;
        break;
      }

      const next = queue.shift();
      if (!next) break;

      const key = next.url.replace(/#.*$/, '');
      if (visited.has(key)) continue;
      visited.add(key);

      try {
        if (pages.length > 0) {
          const navigation = await page.goto(next.url, {
            waitUntil: 'domcontentloaded',
            timeout: INSPECTION_LIMITS.navigationMs,
          });
          if ((navigation?.status() ?? 200) >= 400) continue;
        }

        const observation = await observePage(page, next.depth, pages.length === 0 ? status : null);
        pages.push(observation);

        if (next.depth < INSPECTION_LIMITS.maxDepth) {
          for (const link of observation.internalLinks.slice(0, 20)) {
            if (!visited.has(link.replace(/#.*$/, ''))) {
              queue.push({ url: link, depth: next.depth + 1 });
            }
          }
        }
      } catch (error) {
        if (process.env.KOVVI_INSPECT_DEBUG === '1') {
          console.error('[inspect] page failed', next.url, error);
        }
        // One unreachable page does not invalidate the rest; the assessment
        // becomes partial rather than failed.
        outcome = pages.length > 0 ? 'partial' : outcome;
      }
    }

    /* ── Captures of the landing page, both viewports ─────────────────────── */
    if (pages.length > 0 && Date.now() < deadline) {
      for (const [name, size] of Object.entries(VIEWPORTS) as [
        'desktop' | 'mobile',
        { width: number; height: number },
      ][]) {
        try {
          await page.setViewportSize(size);
          await page.goto(finalUrl, {
            waitUntil: 'domcontentloaded',
            timeout: INSPECTION_LIMITS.navigationMs,
          });
          const png = await page.screenshot({ fullPage: false, type: 'png' });
          captures.push({ viewport: name, url: finalUrl, png, ...size });
        } catch {
          // A capture that fails costs us an image, not the assessment.
          outcome = outcome === 'complete' ? 'partial' : outcome;
        }
      }
    }

    if (pages.length === 0 && outcome === 'complete') {
      outcome = 'inconclusive_timeout';
      inconclusiveDetail = 'The site loaded but no page could be read.';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'inspection failed';
    const timedOut = /timeout/i.test(message);

    return {
      ...base,
      outcome: timedOut ? 'inconclusive_timeout' : 'failed',
      inconclusiveDetail: message,
      finalUrl,
      status,
      redirectChain,
      pages,
      captures,
      finishedAt: new Date(),
    };
  } finally {
    await context.close().catch(() => {});
    if (!options.browser) await ownBrowser.close().catch(() => {});
  }

  return {
    ...base,
    outcome,
    inconclusiveDetail,
    finalUrl,
    status,
    redirectChain,
    pages,
    captures,
    finishedAt: new Date(),
  };
}
