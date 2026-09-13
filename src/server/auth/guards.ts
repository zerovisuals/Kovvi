import { redirect } from 'next/navigation';
import { getSession, getTenantContext, type ActiveSession } from './session';
import { NotFoundError, type TenantContext } from '../db/tenant';

/**
 * Authorization happens HERE and in the repository layer — never in `proxy.ts`.
 *
 * Next's proxy (formerly middleware) runs before routing and is the wrong place
 * for access decisions: it cannot see what a page will actually load, and a
 * route that is reachable another way would bypass it entirely. It handles
 * cheap redirects for signed-out visitors; these guards decide what anyone can
 * actually read.
 */

/** For pages. Redirects a signed-out visitor to sign-in, preserving intent. */
export async function requireSession(returnTo?: string): Promise<ActiveSession> {
  const active = await getSession();
  if (!active) {
    const target = returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : '/sign-in';
    redirect(target);
  }
  return active;
}

/** For pages. The tenant context, redirecting if signed out. */
export async function requireTenant(returnTo?: string): Promise<TenantContext> {
  await requireSession(returnTo);
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');
  return ctx;
}

/**
 * For server actions and route handlers, where a redirect would be wrong.
 * Throws rather than redirecting, so the caller returns a typed error the UI
 * can render in place.
 */
export async function requireTenantOrThrow(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) throw new NotFoundError('Session');
  return ctx;
}

/** Owner-only operations: billing, deletion, export. */
export async function requireOwner(): Promise<TenantContext> {
  const ctx = await requireTenantOrThrow();
  if (ctx.role !== 'owner') {
    // "Not found" rather than "forbidden", consistently: the response should
    // not confirm that the thing being probed exists.
    throw new NotFoundError('Workspace setting');
  }
  return ctx;
}
