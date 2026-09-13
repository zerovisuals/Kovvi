import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertPublicTarget,
  classifyAddress,
  isPublicTarget,
  UnsafeTargetError,
} from '@/lib/net/ssrf';

/**
 * The SSRF policy is the boundary between "fetches public web pages" and
 * "fetches anything on our network for whoever asks", so it is tested against
 * the actual bypasses rather than only the happy path.
 */

const savedEnv = { ...process.env };

/**
 * `@types/node` types NODE_ENV as read-only, but these tests must exercise the
 * production guard — the whole point is that the loopback escape hatch behaves
 * differently there. Assigning through a widened view is the narrowest way to
 * do that without loosening the type everywhere.
 */
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

afterEach(() => {
  process.env = { ...savedEnv };
});

describe('address classification', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback'],
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.168.1.1', 'private'],
    ['169.254.169.254', 'link-local'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'this network'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'loopback'],
    ['fe80::1', 'link-local'],
    ['fc00::1', 'unique local'],
    ['fd12:3456::1', 'unique local'],
  ])('rejects %s as %s', (address, expected) => {
    expect(classifyAddress(address)).toBe(expected);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])(
    'allows the public address %s',
    (address) => {
      expect(classifyAddress(address)).toBeNull();
    },
  );

  it('sees through an IPv4-mapped IPv6 address', () => {
    // ::ffff:10.0.0.1 is 10.0.0.1 wearing a hat. Missing this is a classic
    // bypass of checks that only look at the textual form.
    expect(classifyAddress('::ffff:10.0.0.1')).toBe('private');
    expect(classifyAddress('::ffff:127.0.0.1')).toBe('loopback');
  });

  it('boundary: 172.15 and 172.32 are public, 172.16–172.31 are not', () => {
    expect(classifyAddress('172.15.255.255')).toBeNull();
    expect(classifyAddress('172.16.0.0')).toBe('private');
    expect(classifyAddress('172.31.255.255')).toBe('private');
    expect(classifyAddress('172.32.0.0')).toBeNull();
  });
});

describe('target validation', () => {
  beforeEach(() => {
    delete process.env.KOVVI_SSRF_ALLOW_LOOPBACK;
    setNodeEnv('test');
  });

  it.each([
    ['file:///etc/passwd', 'scheme_not_allowed'],
    ['ftp://example.com/x', 'scheme_not_allowed'],
    ['gopher://example.com', 'scheme_not_allowed'],
    ['https://user:pass@example.com', 'credentials_in_url'],
    ['http://example.com:22/', 'port_not_allowed'],
    ['http://example.com:6379/', 'port_not_allowed'],
    ['http://169.254.169.254/latest/meta-data/', 'metadata_endpoint'],
    ['http://metadata.google.internal/', 'metadata_endpoint'],
    ['http://127.0.0.1:80/', 'private_address'],
    ['http://10.0.0.5/', 'private_address'],
    ['http://192.168.0.1/', 'private_address'],
    ['http://[::1]/', 'private_address'],
  ])('refuses %s', async (url, reason) => {
    await expect(assertPublicTarget(url)).rejects.toMatchObject({
      name: 'UnsafeTargetError',
      reason,
    });
  });

  it('refuses a bare internal hostname with no public suffix', async () => {
    await expect(assertPublicTarget('http://localhost/')).rejects.toBeInstanceOf(UnsafeTargetError);
    await expect(assertPublicTarget('http://redis/')).rejects.toBeInstanceOf(UnsafeTargetError);
  });

  it('allows a real public host and returns its addresses for pinning', async () => {
    const target = await assertPublicTarget('https://example.com/');
    expect(target.url.hostname).toBe('example.com');
    expect(target.addresses.length).toBeGreaterThan(0);
    // The caller pins the socket to these, so a later DNS answer cannot
    // redirect the connection somewhere private.
    for (const address of target.addresses) {
      expect(classifyAddress(address)).toBeNull();
    }
  });

  it('reports unreachable names as a DNS failure, not as safe', async () => {
    expect(await isPublicTarget('https://this-name-should-not-resolve.invalid/')).toBe(false);
  });
});

describe('the loopback escape hatch', () => {
  beforeEach(() => {
    process.env.KOVVI_SSRF_ALLOW_LOOPBACK = '1';
  });

  it('permits loopback under NODE_ENV=test, for fixture sites', async () => {
    setNodeEnv('test');
    const target = await assertPublicTarget('http://127.0.0.1:80/');
    expect(target.url.hostname).toBe('127.0.0.1');
  });

  it('THROWS in production rather than quietly disabling the defence', async () => {
    setNodeEnv('production');
    // Failing loudly matters more than failing safe here: an operator who set
    // this has a broken mental model, and a silent downgrade would hide it.
    await expect(assertPublicTarget('http://127.0.0.1/')).rejects.toThrow(
      /KOVVI_SSRF_ALLOW_LOOPBACK is set in production/,
    );
  });

  it('still refuses non-loopback private addresses even when set', async () => {
    setNodeEnv('test');
    await expect(assertPublicTarget('http://10.0.0.1/')).rejects.toMatchObject({
      reason: 'private_address',
    });
    await expect(assertPublicTarget('http://169.254.169.254/')).rejects.toMatchObject({
      reason: 'metadata_endpoint',
    });
  });
});
