import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb } from '../db/client';
import { membership, session, user, workspace } from '../db/schema';
import type { TenantContext } from '../db/tenant';

/**
 * Sessions: an opaque random token in an HttpOnly cookie, stored hashed.
 *
 * Opaque rather than a JWT, deliberately. A session that lives in the database
 * can be revoked the moment a user signs out or an account is compromised; a
 * self-describing token cannot, without rebuilding the very lookup a JWT was
 * meant to avoid. For a product holding someone's prospect list and outbound
 * mail, revocability is worth more than a saved query.
 *
 * Only the SHA-256 of the token is stored, so a leaked database does not grant
 * access to live sessions.
 */

export const SESSION_COOKIE = 'kovvi_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
};

export type ActiveSession = {
  readonly user: SessionUser;
  readonly workspaceId: string;
  readonly role: 'owner' | 'member';
};

/** Issues a session and sets the cookie. Returns the raw token for tests. */
export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string } = {},
): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await getDb()
    .insert(session)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return token;
}

/**
 * Resolves the current session, or null.
 *
 * Returns the user's workspace alongside, because essentially every caller
 * needs both and a second round trip to find the workspace would be wasted on
 * every request.
 */
export async function getSession(): Promise<ActiveSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      workspaceId: membership.workspaceId,
      role: membership.role,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .innerJoin(membership, eq(membership.userId, user.id))
    .innerJoin(workspace, eq(membership.workspaceId, workspace.id))
    .where(and(eq(session.tokenHash, hashToken(token)), gt(session.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    user: { id: row.userId, email: row.email, name: row.name },
    workspaceId: row.workspaceId,
    role: row.role,
  };
}

/** The tenant context for the current session, or null. */
export async function getTenantContext(): Promise<TenantContext | null> {
  const active = await getSession();
  if (!active) return null;
  return {
    workspaceId: active.workspaceId,
    userId: active.user.id,
    role: active.role,
  };
}

/** Revokes the current session and clears the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await getDb().delete(session).where(eq(session.tokenHash, hashToken(token)));
  }

  store.delete(SESSION_COOKIE);
}

/** Removes expired rows. Called opportunistically at sign-in. */
export async function pruneExpiredSessions(): Promise<void> {
  await getDb().delete(session).where(lt(session.expiresAt, new Date()));
}
