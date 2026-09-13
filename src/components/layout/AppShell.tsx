import type { ReactNode } from 'react';
import { NavRail } from './NavRail';
import type { WorkspaceSummary } from '@/server/auth/session';
import { MobileNav } from './MobileNav';
import { SampleBanner } from '@/components/sample/SampleBanner';

/**
 * The application frame: rail, content, and an optional persistent evidence
 * rail on detail views.
 *
 * The evidence rail is a COLUMN, not a drawer. The brief requires source
 * inspection to sit within one interaction of any claim, and a drawer costs
 * one interaction before you have read anything. Keeping it always-present is
 * what makes "check the source" the default behaviour rather than a detour.
 */
export function AppShell({
  children,
  evidence,
  workspaces,
  activeWorkspaceId,
  isSample,
  banner,
}: {
  readonly children: ReactNode;
  /** Rendered in the persistent right-hand rail on detail views. */
  readonly evidence?: ReactNode;
  readonly workspaces: readonly WorkspaceSummary[];
  readonly activeWorkspaceId: string;
  readonly isSample: boolean;
  /** Workspace-wide notices: disconnected account, inactive subscription. */
  readonly banner?: ReactNode;
}) {
  return (
    <div className="bg-page flex min-h-dvh">
      <NavRail workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />

      <div className="flex min-w-0 flex-1 flex-col">
        {isSample ? <SampleBanner /> : null}
        {banner}

        <div className="flex min-w-0 flex-1">
          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>

          {evidence ? (
            <aside
              aria-label="Evidence"
              className="rule-l bg-card sticky top-0 hidden h-dvh w-(--spacing-evidence) shrink-0 overflow-y-auto xl:block"
            >
              {evidence}
            </aside>
          ) : null}
        </div>

        <MobileNav />
      </div>
    </div>
  );
}
