import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Playwright and pg must never be bundled — they load native/binary assets at
  // runtime. PGlite is deliberately absent here: it is never imported by the web
  // process (see scripts/db-server.ts and docs/ARCHITECTURE.md).
  serverExternalPackages: ['playwright', 'playwright-core', 'pg'],

  images: {
    // Prospect screenshots are served from our own blob route, never optimised
    // from a remote host. Keep the Next 16 SSRF defaults intact.
    dangerouslyAllowLocalIP: false,
  },

  typedRoutes: true,
};

export default nextConfig;
