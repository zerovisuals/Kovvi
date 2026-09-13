import { createHash } from 'node:crypto';
import { assertPublicTarget, UnsafeTargetError } from './ssrf';

/**
 * Fetching a page we do not control.
 *
 * Everything here exists because the other end is hostile until proven
 * otherwise: it may redirect us somewhere private, stream gigabytes, hang
 * forever, or serve a binary pretending to be HTML.
 *
 * Limits are deliberately strict. Kovvi reads public marketing pages to gather
 * evidence; a page that needs more than 2 MB of HTML or fifteen seconds is not
 * one whose content we need.
 */

export const FETCH_LIMITS = {
  /** Per-request wall clock. */
  timeoutMs: 15_000,
  /** HTML and JSON. A page larger than this is not a page we need to read. */
  maxBytes: 2 * 1024 * 1024,
  /** Images (captures are taken by the browser; this is for favicons and logos). */
  maxImageBytes: 8 * 1024 * 1024,
  /** Redirect hops. Every one is re-validated. */
  maxRedirects: 5,
} as const;

/** Identifies Kovvi honestly and gives site owners a way to object. */
export const USER_AGENT =
  'KovviBot/0.1 (+https://kovvi.example/bot; prospect research; contact: hello@kovvi.example)';

export type FetchOutcome =
  | {
      readonly ok: true;
      readonly url: string;
      readonly finalUrl: string;
      readonly status: number;
      readonly redirectChain: readonly string[];
      readonly contentType: string | null;
      readonly body: string;
      readonly byteLength: number;
      readonly contentHash: string;
      readonly retrievedAt: Date;
      /** True when the body was cut short at the byte cap. */
      readonly truncated: boolean;
    }
  | {
      readonly ok: false;
      readonly url: string;
      /**
       * `blocked` and `refused` are different facts, and the product shows them
       * differently: one means the site turned us away (which says nothing
       * about its quality), the other that we declined to go there.
       */
      readonly reason:
        | 'blocked'
        | 'refused'
        | 'timeout'
        | 'too_large'
        | 'network'
        | 'unsupported_content'
        | 'too_many_redirects';
      readonly status: number | null;
      readonly detail: string;
      readonly retrievedAt: Date;
    };

const TEXTUAL_CONTENT = /^(?:text\/|application\/(?:json|xml|xhtml\+xml|ld\+json|rss\+xml))/i;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashUrl(url: string): string {
  // Normalise before hashing so trivially different spellings of one page do
  // not each become their own source record.
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }
    if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return sha256(parsed.href);
  } catch {
    return sha256(url);
  }
}

/**
 * Fetches a public URL, following redirects one hop at a time so that EVERY
 * intermediate target is re-validated. `redirect: 'follow'` would hand that
 * decision to undici, which knows nothing about our policy — and a public URL
 * redirecting to 169.254.169.254 is one of the most common SSRF payloads.
 */
export async function safeFetch(
  input: string,
  options: {
    readonly maxBytes?: number;
    readonly timeoutMs?: number;
    readonly accept?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<FetchOutcome> {
  const retrievedAt = new Date();
  const maxBytes = options.maxBytes ?? FETCH_LIMITS.maxBytes;
  const redirectChain: string[] = [];

  let current = input;

  for (let hop = 0; hop <= FETCH_LIMITS.maxRedirects; hop += 1) {
    let target;
    try {
      target = await assertPublicTarget(current);
    } catch (error) {
      if (error instanceof UnsafeTargetError) {
        return {
          ok: false,
          url: input,
          reason: 'refused',
          status: null,
          detail: error.message,
          retrievedAt,
        };
      }
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_LIMITS.timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    let response: Response;
    try {
      response = await fetch(target.url, {
        // Manual, so each hop goes back through assertPublicTarget above.
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: options.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en',
        },
      });
    } catch (error) {
      const aborted = controller.signal.aborted;
      return {
        ok: false,
        url: input,
        reason: aborted ? 'timeout' : 'network',
        status: null,
        detail: error instanceof Error ? error.message : 'request failed',
        retrievedAt,
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return {
          ok: false,
          url: input,
          reason: 'network',
          status: response.status,
          detail: 'redirect without a location header',
          retrievedAt,
        };
      }

      redirectChain.push(target.url.href);
      current = new URL(location, target.url).href;
      continue;
    }

    // 401/403/429 mean the site turned us away. That is a fact about access,
    // not about the website's quality, and the pipeline records it as
    // inconclusive rather than as a finding.
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return {
        ok: false,
        url: input,
        reason: 'blocked',
        status: response.status,
        detail: `server responded ${response.status}`,
        retrievedAt,
      };
    }

    const contentType = response.headers.get('content-type');

    if (contentType && !TEXTUAL_CONTENT.test(contentType)) {
      // Recorded, not parsed. We note what was there without executing or
      // interpreting it.
      return {
        ok: false,
        url: input,
        reason: 'unsupported_content',
        status: response.status,
        detail: contentType,
        retrievedAt,
      };
    }

    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > maxBytes) {
      return {
        ok: false,
        url: input,
        reason: 'too_large',
        status: response.status,
        detail: `content-length ${declared} exceeds ${maxBytes}`,
        retrievedAt,
      };
    }

    const { text, byteLength, truncated } = await readCapped(response, maxBytes);

    return {
      ok: true,
      url: input,
      finalUrl: target.url.href,
      status: response.status,
      redirectChain,
      contentType,
      body: text,
      byteLength,
      contentHash: sha256(text),
      retrievedAt,
      truncated,
    };
  }

  return {
    ok: false,
    url: input,
    reason: 'too_many_redirects',
    status: null,
    detail: `more than ${FETCH_LIMITS.maxRedirects} redirects`,
    retrievedAt,
  };
}

/**
 * Streams the body with a running byte count, aborting at the cap.
 *
 * `response.text()` would buffer the whole thing first, which makes the byte
 * limit advisory — a server that ignores content-length could still exhaust
 * memory before the check ran.
 */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; byteLength: number; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: '', byteLength: 0, truncated: false };

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const chunks: string[] = [];
  let byteLength = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      byteLength += value.byteLength;

      if (byteLength > maxBytes) {
        const keep = value.subarray(0, value.byteLength - (byteLength - maxBytes));
        chunks.push(decoder.decode(keep, { stream: true }));
        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    chunks.push(decoder.decode());
    reader.releaseLock?.();
  }

  return { text: chunks.join(''), byteLength: Math.min(byteLength, maxBytes), truncated };
}
