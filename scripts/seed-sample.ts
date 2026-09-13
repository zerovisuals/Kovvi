/**
 * Seeds the sample workspace for a user.
 *
 *   pnpm db:seed <email>
 *
 * Runs the real pipeline against local fixture sites, so the sample data is
 * genuinely retrieved rather than invented rows. See src/server/seed/sample.ts.
 */
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db/client.js';
import { user } from '../src/server/db/schema/index.js';
import { seedSampleWorkspace } from '../src/server/seed/sample.js';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const email = process.argv[2];

if (!email) {
  console.error('usage: pnpm db:seed <email>');
  process.exit(1);
}

try {
  const db = getDb();

  const [target] = await db.select().from(user).where(eq(user.email, email.toLowerCase())).limit(1);

  if (!target) {
    console.error(`No user with email ${email}. Sign up first, then seed.`);
    process.exit(1);
  }

  console.log(`[seed] building a sample workspace for ${email}…`);
  const result = await seedSampleWorkspace(db, target.id);

  console.log(
    `[seed] done: ${result.opportunities} opportunities, ${result.assessments} assessments, ` +
      `${result.captures} screenshots, ${result.drafts} drafts, ` +
      `${result.conversations} conversation (workspace ${result.workspaceId})`,
  );
} catch (error) {
  console.error('[seed] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
