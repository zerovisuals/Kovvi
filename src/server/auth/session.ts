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

/**
 * Which workspace the user is currently looking at.
 *
 * A user has at least two — their own, and the sample one — and the brief's
 * sample-vs-real separation is meaningless without a way to move between them.
 * Stored in a cookie rather than the session row so switching does not
 * invalidate other tabs, and validated against membership on every read: a
 * forged cookie selects a workspace the user is not a member of, so the value
 * is a hint, never an authorisation.
 */
export const WORKSPACE_COOKIE = 'kovvi_workspace';
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

export type WorkspaceSummary = {
  readonly id: string;
  readonly name: string;
  readonly kind: 'real' | 'sample';
};

export type ActiveSession = {
  readonly user: SessionUser;
  readonly workspaceId: string;
  readonly role: 'owner' | 'member';
  /** Everything the user can switch to. */
  readonly workspaces: readonly WorkspaceSummary[];
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
      workspaceName: workspace.name,
      workspaceKind: workspace.kind,
      role: membership.role,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .innerJoin(membership, eq(membership.userId, user.id))
    .innerJoin(workspace, eq(membership.workspaceId, workspace.id))
    .where(and(eq(session.tokenHash, hashToken(token)), gt(session.expiresAt, new Date())));

  if (rows.length === 0) return null;

  /**
   * The requested workspace is honoured only if the user is actually a member
   * of it. Because the candidate set comes from the membership join, a forged
   * cookie simply finds no match and falls back — the cookie selects among
   * workspaces the user already has, it never grants one.
   */
  const requested = store.get(WORKSPACE_COOKIE)?.value;
  const active =
    rows.find((row) => row.workspaceId === requested) ??
    rows.find((row) => row.workspaceKind === 'real') ??
    rows[0]!;

  return {
    user: { id: active.userId, email: active.email, name: active.name },
    workspaceId: active.workspaceId,
    role: active.role,
    workspaces: rows.map((row) => ({
      id: row.workspaceId,
      name: row.workspaceName,
      kind: row.workspaceKind,
    })),
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
