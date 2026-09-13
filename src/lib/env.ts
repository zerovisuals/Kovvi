/**
 * Environment reads, in one place.
 *
 * Capability credentials are deliberately NOT read here — they belong to
 * `src/server/capabilities/registry.ts`, which is the single source of truth
 * for what is connected and what is honestly absent.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * `/tokens` and `/states` are internal review surfaces, not product. They stay
 * off unless explicitly enabled, and `notFound()` — rather than a redirect —
 * keeps their existence unobservable.
 */
export function devRoutesEnabled(): boolean {
  return process.env.KOVVI_DEV_ROUTES === '1';
}

/**
 * Reads a required variable, failing loudly at the point of use rather than
 * silently producing an empty string somewhere downstream.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example for what it is and where to get it.`,
    );
  }
  return value;
}
