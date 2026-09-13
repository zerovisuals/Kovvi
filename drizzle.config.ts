import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

/**
 * One dialect, one driver, every environment.
 *
 * Locally `DATABASE_URL` points at `pnpm db:server` (PGlite speaking the real
 * Postgres wire protocol); in production it points at a hosted Postgres.
 * drizzle-kit cannot tell the difference, which is the entire point — the
 * migrations generated here are the migrations that run in production.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5433/postgres',
  },
  strict: true,
  verbose: true,
});
