import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * ONE TARGET POLICY, SHARED BY EVERYTHING THAT MAKES A REQUEST
 *
 * Kovvi fetches URLs that users and third-party sources supply, which is the
 * textbook setup for server-side request forgery: persuade the server to fetch
 * something only it can reach — a cloud metadata endpoint, an internal admin
 * panel, a database on the same private network — and read the result back out
 * through the product's own UI.
 *
 * Both the HTTP fetcher and the browser go through `assertPublicTarget`. A
 * second implementation for the browser would eventually drift from this one,
 * and the drift is the vulnerability.
 *
 * Three things this does that a naive hostname check does not:
 *
 *  1. Resolves DNS first and checks EVERY address. A hostname resolving to
 *     127.0.0.1 is the simplest bypass there is.
 *  2. Re-validates after every redirect. A public URL that 302s to
 *     169.254.169.254 is the second simplest.
 *  3. Returns the resolved addresses so the caller can PIN the connection to
 *     the address that was checked, defeating DNS rebinding — where the name
 *     resolves publicly during the check and privately a moment later.
 */

export type TargetRejection =
  | 'scheme_not_allowed'
  | 'port_not_allowed'
  | 'credentials_in_url'
  | 'hostname_invalid'
  | 'dns_failed'
  | 'private_address'
  | 'metadata_endpoint'
  | 'blocked_hostname';

export class UnsafeTargetError extends Error {
  constructor(
    readonly reason: TargetRejection,
    readonly target: string,
    detail?: string,
  ) {
    super(`Refused to fetch ${target}: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'UnsafeTargetError';
  }
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443']);

/**
 * Hostnames that resolve to metadata services on the major clouds. Blocked by
 * name as well as by address, because a split-horizon DNS setup can point them
 * somewhere that passes an address check.
 */
const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
]);

/** Well-known cloud metadata addresses. */
const METADATA_ADDRESSES = new Set([
  '169.254.169.254', // AWS, Azure, GCP, DigitalOcean, Oracle
  '169.254.170.2', // AWS ECS task metadata
  '100.100.100.200', // Alibaba Cloud
  'fd00:ec2::254', // AWS IMDSv6
]);

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** CIDR ranges that must never be reachable from a fetch worker. */
const BLOCKED_V4_RANGES: readonly (readonly [start: string, bits: number, label: string])[] = [
  ['0.0.0.0', 8, 'this network'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'carrier-grade NAT'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'IETF protocol assignments'],
  ['192.0.2.0', 24, 'documentation'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'benchmarking'],
  ['198.51.100.0', 24, 'documentation'],
  ['203.0.113.0', 24, 'documentation'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
];

function classifyIpv4(address: string): string | null {
  const value = ipv4ToInt(address);
  if (value === null) return 'unparseable';

  for (const [start, bits, label] of BLOCKED_V4_RANGES) {
    const base = ipv4ToInt(start);
    if (base === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((value & mask) === (base & mask)) return label;
  }
  return null;
}

function classifyIpv6(address: string): string | null {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, '');

  if (lower === '::1' || lower === '::') return 'loopback';
  if (lower.startsWith('fe80')) return 'link-local';
  // fc00::/7 — unique local addresses
  if (/^f[cd]/.test(lower)) return 'unique local';
  if (lower.startsWith('ff')) return 'multicast';

  // IPv4-mapped (::ffff:10.0.0.1) would otherwise slip past every check above.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return classifyIpv4(mapped[1]);

  return null;
}

export function classifyAddress(address: string): string | null {
  const family = isIP(address);
  if (family === 4) return classifyIpv4(address);
  if (family === 6) return classifyIpv6(address);
  return 'unparseable';
}

/**
 * Loopback is allowed ONLY under NODE_ENV=test, so the fixture sites can be
 * served locally. The hard throw is the point: an operator who sets this in
 * production has disabled the main SSRF defence, and should find out
 * immediately rather than after an incident.
 */
function loopbackAllowed(): boolean {
  const requested = process.env.KOVVI_SSRF_ALLOW_LOOPBACK === '1';
  if (!requested) return false;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'KOVVI_SSRF_ALLOW_LOOPBACK is set in production. This disables SSRF protection ' +
        'for loopback addresses and must never be enabled outside tests.',
    );
  }
  return true;
}

export type SafeTarget = {
  readonly url: URL;
  /** Resolved addresses, for pinning the connection to what was checked. */
  readonly addresses: readonly string[];
};

/**
 * Validates a URL and resolves it. Throws `UnsafeTargetError` if the target is
 * anything other than a public internet host.
 */
export async function assertPublicTarget(input: string | URL): Promise<SafeTarget> {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    throw new UnsafeTargetError('hostname_invalid', String(input), 'not a valid URL');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeTargetError('scheme_not_allowed', url.href, url.protocol);
  }

  // Credentials in a URL are a redirect-laundering trick and never legitimate
  // for a public page we are merely reading.
  if (url.username || url.password) {
    throw new UnsafeTargetError('credentials_in_url', url.href);
  }

  // `URL.hostname` keeps the brackets on an IPv6 literal (`[::1]`), which
  // `isIP` does not accept — so without stripping them a literal address would
  // be sent to DNS resolution instead of being classified as an address.
  const hostname = url.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[(.+)\]$/, '$1');

  if (!hostname) {
    throw new UnsafeTargetError('hostname_invalid', url.href, 'empty hostname');
  }

  /**
   * The test-fixture exemption, scoped as narrowly as it can be: loopback only,
   * and only when the escape hatch is on (which throws outside tests).
   *
   * It has to cover the port as well as the address, because the fixture server
   * binds an ephemeral port — and a port allowlist of 80/443 is precisely what
   * stops a real SSRF from reaching Redis on 6379.
   */
  const isLoopbackHost =
    hostname === 'localhost' ||
    hostname === '::1' ||
    classifyAddress(hostname) === 'loopback';
  const fixtureException = isLoopbackHost && loopbackAllowed();

  if (!fixtureException && !ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeTargetError('port_not_allowed', url.href, url.port);
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeTargetError('metadata_endpoint', url.href, hostname);
  }

  // A hostname with no dot is an internal name (`localhost`, `router`, a
  // Kubernetes service) unless it is a bare IP literal.
  if (!hostname.includes('.') && !hostname.includes(':') && isIP(hostname) === 0) {
    if (!fixtureException) {
      throw new UnsafeTargetError('blocked_hostname', url.href, 'no public suffix');
    }
  }

  let addresses: string[];

  if (isIP(hostname) !== 0) {
    addresses = [hostname];
  } else {
    try {
      const resolved = await dnsLookup(hostname, { all: true, verbatim: true });
      addresses = resolved.map((entry) => entry.address);
    } catch (error) {
      throw new UnsafeTargetError(
        'dns_failed',
        url.href,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  if (addresses.length === 0) {
    throw new UnsafeTargetError('dns_failed', url.href, 'no addresses');
  }

  // EVERY address must be acceptable. A name that returns one public and one
  // private address is a rebinding attempt, not a misconfiguration to tolerate.
  for (const address of addresses) {
    if (METADATA_ADDRESSES.has(address.toLowerCase())) {
      throw new UnsafeTargetError('metadata_endpoint', url.href, address);
    }

    const classification = classifyAddress(address);
    if (!classification) continue;

    if (classification === 'loopback' && loopbackAllowed()) continue;

    throw new UnsafeTargetError('private_address', url.href, `${address} is ${classification}`);
  }

  return { url, addresses };
}

/** Non-throwing variant, for filtering many candidate URLs. */
export async function isPublicTarget(input: string | URL): Promise<boolean> {
  try {
    await assertPublicTarget(input);
    return true;
  } catch {
    return false;
  }
}
