/**
 * Screenshot a running Kovvi page, in a chosen theme, and report anything the
 * browser complained about.
 *
 * Visual work is not verifiable by typechecking, so this is how a screen gets
 * confirmed to actually render rather than merely compile.
 *
 *   pnpm tsx scripts/shot.ts <url> <out.png> [light|dark] [width] [height]
 *
 * Chromium is pre-installed in this environment; never run `playwright install`.
 */
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { launchChromium } from '../src/server/inspect/chromium.js';

const [url, out, theme = 'light', width = '1280', height = '1200'] = process.argv.slice(2);

if (!url || !out) {
  console.error('usage: tsx scripts/shot.ts <url> <out.png> [light|dark] [width] [height]');
  process.exit(1);
}

await mkdir(dirname(out), { recursive: true });

const browser = await launchChromium();

try {
  const page = await browser.newPage({
    viewport: { width: Number(width), height: Number(height) },
  });

  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) =>
    problems.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`),
  );

  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  // Let client-side measurement and transitions settle before capturing.
  await page.waitForTimeout(700);
  await page.screenshot({ path: out, fullPage: true });

  console.log(
    JSON.stringify(
      { url, status: response?.status() ?? null, theme, out, problems },
      null,
      2,
    ),
  );

  if (problems.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
