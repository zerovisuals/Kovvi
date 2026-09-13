'use client';

import { useTransition } from 'react';
import { switchWorkspace } from '@/server/auth/workspace-actions';
import type { WorkspaceSummary } from '@/server/auth/session';

/**
 * Moves between the real workspace and the sample one.
 *
 * The sample workspace is only useful if you can actually get into it, and the
 * real one is only trustworthy if you can tell at a glance which you are in. So
 * the current workspace's KIND is always on screen, not just its name — a
 * "Sample" label here is the same fact the row badges and the banner carry, at
 * the level where the mistake would be made.
 */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  readonly workspaces: readonly WorkspaceSummary[];
  readonly activeId: string;
}) {
  const [pending, startTransition] = useTransition();

  if (workspaces.length < 2) return null;

  return (
    <div className="px-2.5 pb-2">
      <label htmlFor="workspace" className="sr-only">
        Workspace
      </label>
      <select
        id="workspace"
        value={activeId}
        disabled={pending}
        onChange={(changeEvent) => {
          const next = changeEvent.target.value;
          startTransition(async () => {
            await switchWorkspace(next);
          });
        }}
        className="border-line bg-card text-ink-muted ease-out text-2xs w-full rounded-sm border px-2 py-1.5 font-mono transition-colors duration-instant disabled:opacity-60"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.kind === 'sample' ? 'Sample · ' : ''}
            {workspace.name}
          </option>
        ))}
      </select>
    </div>
  );
}
