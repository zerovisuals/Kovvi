import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { existsSync } from 'node:fs';

/**
 * Chromium launch, resolved once for the whole product.
 *
 * Website inspection is the capability that makes Kovvi's evidence real, so the
 * environment quirks around actually getting a browser to start are centralised
 * here rather than rediscovered per caller.
 *
 * Two of them matter:
 *
 *  1. **A pre-installed browser may not match the Playwright build number.**
 *     Playwright looks for an exact build under PLAYWRIGHT_BROWSERS_PATH and
 *     refuses to start on a mismatch, telling you to download — which is both
 *     unnecessary and, in sandboxed environments, impossible. Pointing at a
 *     known-good binary sidesteps the version handshake entirely.
 *
 *  2. **`--no-sandbox` is required when running as root**, which containers
 *     commonly do. It is a real weakening of Chromium's own defence in depth,
 *     so it is opt-out rather than unconditional: production should run the
 *     browser as a non-root user and set KOVVI_BROWSER_NO_SANDBOX=0.
 *
 * Note that the sandbox is not what protects us from hostile prospect sites —
 * `src/lib/net/ssrf.ts` and per-context request interception do that, and they
 * apply either way.
 *
 * Deliberately NOT marked `server-only`: the standalone job worker is a plain
 * Node process, and that marker throws outside a bundler that maps it.
 */

/** Candidate locations for a pre-installed Chromium, in order of preference. */
const PREINSTALLED_CANDIDATES = [
  process.env.KOVVI_CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
].filter((path): path is string => Boolean(path));

/**
 * Returns an explicit executable path when a usable pre-installed browser
 * exists, or `undefined` to let Playwright resolve its own managed download.
 */
export function resolveChromiumExecutable(): string | undefined {
  return PREINSTALLED_CANDIDATES.find((path) => existsSync(path));
}

function sandboxEnabled(): boolean {
  return process.env.KOVVI_BROWSER_NO_SANDBOX === '0';
}

/**
 * Chromium does not read `HTTPS_PROXY` from the environment the way Node and
 * curl do, so in a sandboxed network where all egress goes through a local
 * proxy it fails with ERR_CONNECTION_RESET while every other tool works — a
 * confusing failure precisely because everything else is fine.
 *
 * Loopback is always bypassed: the test fixture server runs there, and sending
 * it through the proxy would break every inspection test.
 */
function proxyServer(): string | undefined {
  return process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY;
}

function proxyConfig(): { server: string; bypass: string } | undefined {
  const server = proxyServer();
  if (!server) return undefined;

  // Chromium's bypass list does not understand the CIDR entries a typical
  // NO_PROXY carries, so pass the host forms it does understand. Loopback is
  // always bypassed: the test fixture server lives there.
  const bypass = ['localhost', '127.0.0.1', '[::1]', '<-loop>'].join(',');

  return { server, bypass };
}

/**
 * Flags needed only to get through an intercepting proxy.
 *
 * Some MITM proxies cannot relay Chromium's TLS 1.3 handshake: the tunnel opens,
 * the ClientHello goes out, a short alert comes back, and the connection resets.
 * Every other tool keeps working, which makes it a genuinely confusing failure —
 * so the diagnosis lives here rather than being rediscovered.
 *
 * Capping at TLS 1.2 is a REAL security downgrade and must never reach
 * production. It is applied only when a proxy is configured, which is never the
 * case in production, and the guard below makes that explicit rather than
 * incidental.
 */
function proxyCompatibilityArgs(): string[] {
  if (!proxyServer()) return [];

  if (process.env.NODE_ENV === 'production' && process.env.KOVVI_ALLOW_PROXY_TLS_DOWNGRADE !== '1') {
    throw new Error(
      'A browser proxy is configured in production. Kovvi will not silently cap TLS at 1.2 ' +
        'for prospect sites. Remove HTTPS_PROXY, or set KOVVI_ALLOW_PROXY_TLS_DOWNGRADE=1 if ' +
        'you have accepted that risk deliberately.',
    );
  }

  return [
    // The actual fix. Everything else here is belt-and-braces for relays that
    // also struggle with multiplexed or UDP transports.
    '--ssl-version-max=tls1.2',
    '--disable-quic',
    '--disable-http2',
  ];
}

export function chromiumLaunchOptions(overrides: LaunchOptions = {}): LaunchOptions {
  const executablePath = resolveChromiumExecutable();
  const proxy = proxyConfig();

  return {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    ...(proxy ? { proxy } : {}),
    args: [
      ...(sandboxEnabled() ? [] : ['--no-sandbox', '--disable-setuid-sandbox']),
      ...proxyCompatibilityArgs(),
      // Trim everything that phones home or costs memory without affecting how
      // a prospect's page renders.
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-default-apps',
      '--no-first-run',
      '--no-default-browser-check',
      '--mute-audio',
      ...(overrides.args ?? []),
    ],
    ...overrides,
  };
}

export function launchChromium(overrides: LaunchOptions = {}): Promise<Browser> {
  return chromium.launch(chromiumLaunchOptions(overrides));
}
