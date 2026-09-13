import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~fixtures': fileURLToPath(new URL('./fixtures', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Website inspection and PGlite bring-up are slow by nature; a stingy
    // timeout here would turn real flakiness into misleading failures.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Each acceptance file owns a database and a fixture server, so files must
    // not share a process. Forks isolate per file, which is the default, but
    // state it explicitly because the isolation is load-bearing here.
    pool: 'forks',
    isolate: true,
  },
});
