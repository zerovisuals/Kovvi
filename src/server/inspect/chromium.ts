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

export function chromiumLaunchOptions(overrides: LaunchOptions = {}): LaunchOptions {
  const executablePath = resolveChromiumExecutable();

  return {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      ...(sandboxEnabled() ? [] : ['--no-sandbox', '--disable-setuid-sandbox']),
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
