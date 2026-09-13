import { eq } from 'drizzle-orm';
import { AppShell } from '@/components/layout/AppShell';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { subscription, workspace } from '@/server/db/schema';
import { AppBanner } from '@/components/layout/AppBanner';

/**
 * The authenticated frame.
 *
 * Reads the workspace once here rather than in each page: the shell needs its
 * name and sample flag, and the subscription banner needs its billing state, so
 * fetching them per route would repeat the same two queries on every
 * navigation.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const db = getDb();

  const [current] = await db
    .select({
      name: workspace.name,
      kind: workspace.kind,
      subscriptionStatus: subscription.status,
    })
    .from(workspace)
    .leftJoin(subscription, eq(subscription.workspaceId, workspace.id))
    .where(eq(workspace.id, ctx.workspaceId))
    .limit(1);

  const status = current?.subscriptionStatus ?? 'absent';
  const billingNeedsAttention = status !== 'active' && status !== 'trialing';

  return (
    <AppShell
      workspaceName={current?.name ?? 'Workspace'}
      isSample={current?.kind === 'sample'}
      banner={
        billingNeedsAttention ? (
          <AppBanner
            tone="uncertain"
            glyph="◇"
            message={
              status === 'absent'
                ? 'Billing is not connected. Allowances still apply and usage is metered for real, so nothing you do now is lost.'
                : `Subscription is ${status.replace('_', ' ')}.`
            }
            action={{ label: 'See usage', href: '/settings/billing' }}
          />
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
