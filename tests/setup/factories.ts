import { nanoid } from 'nanoid';
import {
  membership,
  researchRun,
  subscription,
  usageLedger,
  user,
  workspace,
  workspacePreference,
} from '@/server/db/schema';
import type { TestDb } from './pglite';

/**
 * Builders for test data.
 *
 * They create the same rows sign-up creates, so a test operates on a workspace
 * shaped exactly like a real one — including `subscription.status = 'absent'`,
 * which is the honest default and therefore the state most tests should see.
 */

export type SeededWorkspace = {
  readonly workspaceId: string;
  readonly userId: string;
};

export async function seedWorkspace(
  db: TestDb,
  options: { allowance?: number; kind?: 'real' | 'sample'; name?: string } = {},
): Promise<SeededWorkspace> {
  const [createdUser] = await db
    .insert(user)
    .values({ email: `test-${nanoid(8)}@kovvi.test` })
    .returning();

  const [createdWorkspace] = await db
    .insert(workspace)
    .values({ name: options.name ?? 'Test workspace', kind: options.kind ?? 'real' })
    .returning();

  if (!createdUser || !createdWorkspace) throw new Error('Failed to seed workspace');

  await db.insert(membership).values({
    workspaceId: createdWorkspace.id,
    userId: createdUser.id,
    role: 'owner',
  });

  await db.insert(workspacePreference).values({ workspaceId: createdWorkspace.id });
  await db.insert(subscription).values({ workspaceId: createdWorkspace.id, status: 'absent' });

  if (options.allowance && options.allowance > 0) {
    await db.insert(usageLedger).values({
      workspaceId: createdWorkspace.id,
      kind: 'grant',
      unitType: 'deep_assessment',
      units: options.allowance,
      idempotencyKey: `grant:${createdWorkspace.id}`,
      note: 'Test allowance',
    });
  }

  return { workspaceId: createdWorkspace.id, userId: createdUser.id };
}

export async function seedRun(
  db: TestDb,
  workspaceId: string,
  options: { unitCap?: number } = {},
): Promise<string> {
  const [run] = await db
    .insert(researchRun)
    .values({
      workspaceId,
      unitCap: options.unitCap ?? 10,
      status: 'running',
      startedAt: new Date(),
    })
    .returning({ id: researchRun.id });

  if (!run) throw new Error('Failed to seed run');
  return run.id;
}
