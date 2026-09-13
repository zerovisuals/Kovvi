'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import {
  account,
  auditEvent,
  membership,
  subscription,
  usageLedger,
  user,
  workspace,
  workspacePreference,
} from '../db/schema';
import { PLAN_ALLOWANCES } from '../billing/usage';
import { hashPassword, needsRehash, validatePassword, verifyPassword } from './password';
import { createSession, destroySession, pruneExpiredSessions } from './session';

/**
 * Sign-up, sign-in, sign-out.
 *
 * These return a typed `{ error }` rather than throwing, because every failure
 * here is something the user can fix and should see next to the field that
 * caused it.
 */

export type AuthResult = { readonly error: string } | { readonly ok: true };

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export async function signUp(_prev: unknown, formData: FormData): Promise<AuthResult> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details above.' };
  }

  const { email, password } = parsed.data;

  const policyError = validatePassword(password);
  if (policyError) return { error: policyError };

  const db = getDb();

  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing.length > 0) {
    // Deliberately specific. Email enumeration is a real concern, but a sign-up
    // form already reveals this by refusing the address, and a vague error here
    // only costs the legitimate user time.
    return { error: 'An account with that email already exists. Sign in instead.' };
  }

  const passwordHash = await hashPassword(password);

  const created = await db.transaction(async (tx) => {
    const [createdUser] = await tx.insert(user).values({ email }).returning();
    if (!createdUser) throw new Error('Failed to create user');

    await tx.insert(account).values({
      id: randomUUID(),
      userId: createdUser.id,
      providerId: 'credentials',
      accountId: email,
      passwordHash,
    });

    const [createdWorkspace] = await tx
      .insert(workspace)
      .values({ name: 'My workspace', kind: 'real' })
      .returning();
    if (!createdWorkspace) throw new Error('Failed to create workspace');

    await tx.insert(membership).values({
      workspaceId: createdWorkspace.id,
      userId: createdUser.id,
      role: 'owner',
    });

    await tx.insert(workspacePreference).values({ workspaceId: createdWorkspace.id });

    // `absent` is the honest default: billing is not connected until it is.
    await tx.insert(subscription).values({ workspaceId: createdWorkspace.id, status: 'absent' });

    /* Grant the period's allowance up front.
       Allowance and BILLING are deliberately separate concerns: usage is
       metered for real from the first minute, so nothing done before billing is
       connected has to be redone afterwards. A workspace with no grant would
       show a limit of zero and make the product look broken rather than
       unbilled. */
    for (const [unitType, units] of Object.entries(PLAN_ALLOWANCES.pro)) {
      await tx.insert(usageLedger).values({
        workspaceId: createdWorkspace.id,
        kind: 'grant',
        unitType: unitType as keyof typeof PLAN_ALLOWANCES.pro,
        units,
        idempotencyKey: `grant:${createdWorkspace.id}:${unitType}`,
        note: 'Initial period allowance',
      });
    }

    await tx.insert(auditEvent).values({
      workspaceId: createdWorkspace.id,
      actorUserId: createdUser.id,
      action: 'account.created',
      subjectType: 'workspace',
      subjectId: createdWorkspace.id,
    });

    return createdUser;
  });

  await createSession(created.id);
  redirect('/today');
}

export async function signIn(_prev: unknown, formData: FormData): Promise<AuthResult> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details above.' };
  }

  const { email, password } = parsed.data;
  const db = getDb();

  const rows = await db
    .select({ userId: user.id, passwordHash: account.passwordHash })
    .from(user)
    .innerJoin(account, eq(account.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);

  const row = rows[0];

  // Hash even when no account exists, so a missing address and a wrong password
  // take the same time. Otherwise the response time is an enumeration oracle.
  const storedHash = row?.passwordHash ?? (await hashPassword(randomUUID()));
  const valid = await verifyPassword(password, storedHash);

  if (!row || !valid) {
    return { error: 'That email and password do not match an account.' };
  }

  // Transparently upgrade a hash made under weaker parameters.
  if (needsRehash(storedHash)) {
    await db
      .update(account)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(account.userId, row.userId));
  }

  await pruneExpiredSessions();
  await createSession(row.userId);
  redirect('/today');
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/');
}
