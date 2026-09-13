import { expect } from 'vitest';

/**
 * Drizzle wraps driver errors, so the Postgres constraint name lives on
 * `error.cause` (sometimes nested further), not on the top-level message.
 * Asserting against the message alone would pass for ANY failure — including
 * a typo in the test — which is exactly the wrong behaviour for tests whose
 * whole purpose is proving a specific constraint fired.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    parts.push(current.message);
    // node-postgres puts the constraint name in a non-standard field.
    const constraint = (current as { constraint?: string }).constraint;
    if (constraint) parts.push(constraint);
    current = current.cause;
  }

  return parts.join(' | ');
}

/** Asserts a promise rejects with an error whose chain mentions `pattern`. */
export async function expectRejection(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }

  expect(thrown, 'expected the database to reject this row, but it was accepted').toBeDefined();
  expect(describeError(thrown)).toMatch(pattern);
}
