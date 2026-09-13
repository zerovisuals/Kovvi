import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * Serves `fixtures/sites/*` on an ephemeral loopback port.
 *
 * Real websites make poor test subjects: they change, they rate-limit, and a
 * test that depends on a stranger's marketing copy fails for reasons that have
 * nothing to do with the code. These fixtures pin the behaviours the brief's
 * acceptance cases are actually about.
 *
 * Two sites behave specially, because that behaviour IS the test:
 *   `blocked`  — answers 403 to our user agent, as a bot-protected site does
 *   `rebrand-old` — 301s to `rebrand-new`, as a rebranded business does
 *
 * Sites are namespaced by the first path segment, so fixture pages link to each
 * other RELATIVELY (`contact.html`, not `/contact.html`). A root-absolute link
 * would resolve outside its own site's prefix — an artefact of serving many
 * sites from one origin, not of how real sites are built.
 */

const FIXTURE_ROOT = resolve(process.cwd(), 'fixtures/sites');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export type FixtureServer = {
  readonly origin: string;
  /** Full URL for a site's page, e.g. `siteUrl('clean-shop')`. */
  siteUrl(site: string, path?: string): string;
  close(): Promise<void>;
};

export async function startFixtureServer(): Promise<FixtureServer> {
  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const segments = url.pathname.split('/').filter(Boolean);
      const site = segments[0] ?? '';

      /* A site that refuses automated readers. The point of acceptance case 4:
         this must produce an inconclusive assessment with ZERO findings, never
         a set of invented defects. */
      if (site === 'blocked') {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      /* A rebranded business: the old domain permanently redirects. */
      if (site === 'rebrand-old') {
        response.writeHead(301, { location: '/rebrand-new/' });
        response.end();
        return;
      }

      const rest = segments.slice(1).join('/') || 'index.html';
      const relativePath = normalize(rest).replace(/^(\.\.[/\\])+/, '');
      const filePath = join(FIXTURE_ROOT, site, relativePath);

      if (!resolve(filePath).startsWith(FIXTURE_ROOT)) {
        response.writeHead(400).end('Bad path');
        return;
      }

      try {
        const body = await readFile(filePath);
        response.writeHead(200, {
          'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        response.end(body);
      } catch {
        response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>Not found</title><h1>404</h1>');
      }
    })();
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(0, '127.0.0.1', resolvePromise);
  });

  const address = server.address();
  if (typeof address === 'string' || address === null) {
    throw new Error('Fixture server did not bind to a port');
  }

  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    siteUrl: (site, path = '') => `${origin}/${site}/${path}`,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
      }),
  };
}
