'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { membership } from '../db/schema';
import { WORKSPACE_COOKIE } from './session';
import { requireTenantOrThrow } from './guards';

/**
 * Switches the active workspace.
 *
 * Membership is re-checked here as well as on read. The cookie is written by
 * the server after that check, so a user cannot set it to a workspace they do
 * not belong to — and `getSession` would reject it even if they did.
 */
export async function switchWorkspace(workspaceId: string): Promise<void> {
  const ctx = await requireTenantOrThrow();

  const [allowed] = await getDb()
    .select({ workspaceId: membership.workspaceId })
    .from(membership)
    .where(and(eq(membership.userId, ctx.userId), eq(membership.workspaceId, workspaceId)))
    .limit(1);

  if (!allowed) {
    // Silently ignored rather than erroring: the only way to reach this is a
    // hand-edited request, and it has already failed to do anything.
    return;
  }

  const store = await cookies();
  store.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');
}
