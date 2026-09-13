/**
 * Drives the real product in a real browser.
 *
 * Typechecking proves a page compiles; this proves a person can actually use
 * it. Every step asserts something a user would notice — that sign-up lands
 * them in the app, that the rail is there, that Connections tells the truth
 * about what is switched on.
 *
 *   pnpm tsx scripts/smoke.ts http://127.0.0.1:3000
 */
import { mkdir } from 'node:fs/promises';
import { launchChromium } from '../src/server/inspect/chromium.js';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const shotDir = process.argv[3] ?? '.scratch/smoke';
await mkdir(shotDir, { recursive: true });

const problems: string[] = [];
const steps: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    steps.push(`  ✓ ${name}`);
  } else {
    steps.push(`  ✕ ${name}${detail ? ` — ${detail}` : ''}`);
    problems.push(name);
  }
}

const browser = await launchChromium();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });

  /* 1. An unauthenticated visitor is sent to sign-in, not shown the app. */
  const guarded = await page.goto(`${base}/today`, { waitUntil: 'networkidle' });
  check('signed-out visitor is redirected away from /today', page.url().includes('/sign-in'),
    `landed on ${page.url()} (${guarded?.status()})`);
  check('the redirect preserves where they were going', page.url().includes('next='));

  /* 2. Sign-up creates an account and lands in the product. */
  const email = `smoke-${Date.now()}@kovvi.test`;
  await page.goto(`${base}/sign-up`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'a-long-enough-password');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/today', { timeout: 20_000 }).catch(() => {});
  check('sign-up lands in the product', page.url().includes('/today'), `at ${page.url()}`);

  /* 3. The shell is actually rendered. */
  check('navigation rail is present', (await page.locator('nav[aria-label="Primary"]').count()) > 0);
  check(
    'billing is honestly reported as not connected',
    (await page.getByText(/Billing is not connected/).count()) > 0,
  );
  await page.screenshot({ path: `${shotDir}/today.png`, fullPage: true });

  /* 4. Connections tells the truth about what is switched on. */
  await page.goto(`${base}/settings/connections`, { waitUntil: 'networkidle' });
  // Query the data attribute rather than the label: the status glyph lives in
  // the same element, so text matching is brittle in a way the markup is not.
  const connectedCount = await page.locator('[data-capability-status="live"]').count();
  const notConnectedCount = await page.locator('[data-capability-status="absent"]').count();
  check('capabilities that need no setup are shown as connected', connectedCount >= 6,
    `found ${connectedCount}`);
  check('capabilities needing keys are shown as not connected', notConnectedCount >= 5,
    `found ${notConnectedCount}`);
  await page.screenshot({ path: `${shotDir}/connections.png`, fullPage: true });

  /* 5. Navigation works and unbuilt screens say so rather than faking. */
  await page.goto(`${base}/shortlist`, { waitUntil: 'networkidle' });
  check('an unbuilt screen says so plainly', (await page.getByText('is not built yet').count()) > 0);
  await page.screenshot({ path: `${shotDir}/shortlist.png`, fullPage: true });

  /* 6. Session survives a reload. */
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' });
  check('session persists across navigation', page.url().includes('/today'));
} finally {
  await browser.close();
}

console.log(steps.join('\n'));
console.log(problems.length === 0 ? '\nSMOKE PASSED' : `\nSMOKE FAILED (${problems.length})`);
if (problems.length > 0) {
  console.log(problems.map((p) => `  - ${p}`).join('\n'));
  process.exitCode = 1;
}
