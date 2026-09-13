import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt.
 *
 * scrypt is memory-hard, standardised (RFC 7914), and built into Node — so
 * there is no native module to compile, which matters for a project that has to
 * run on a laptop, in CI and on a serverless host without three different
 * build stories. Argon2id would be a marginal improvement and a real
 * dependency; this is the better trade here.
 *
 * Parameters are the current OWASP recommendation for scrypt: N=2^17, r=8, p=1
 * (~128 MB of memory per hash). They are stored IN the hash string, so they can
 * be raised later without invalidating existing passwords — `needsRehash`
 * detects the old ones on next sign-in.
 */

const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs roughly 128 * N * r bytes; Node's default cap is below that.
const MAX_MEM = 256 * N * R;

/** Formatted `scrypt$N$r$p$salt$hash`, so parameters travel with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return ['scrypt', N, R, P, salt.toString('base64'), derived.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltRaw ?? '', 'base64');
  const expected = Buffer.from(hashRaw ?? '', 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scrypt(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: 256 * n * r,
  });

  // Constant-time: a length-dependent early return would leak information.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** True when a stored hash used weaker parameters than we now require. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < N || Number(parts[2]) < R;
}

/**
 * Minimum viable policy: length over composition rules, which is both the
 * current NIST guidance and what actually correlates with strength.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. Length matters far more than symbols.`;
  }
  if (password.length > 512) {
    return 'That password is unusually long; keep it under 512 characters.';
  }
  return null;
}
