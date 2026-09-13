'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_NAV, SETTINGS_NAV } from './navigation';
import { Mark } from '@/components/brand/Mark';
import { Wordmark } from '@/components/brand/Wordmark';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import type { WorkspaceSummary } from '@/server/auth/session';

/**
 * The navigation rail: 72px of icons, expanding to 232px on hover or focus.
 *
 * Collapsed by default because the application is a reading surface — evidence,
 * captures, message drafts — and permanent navigation chrome would eat the
 * width that content needs. Expanding on FOCUS as well as hover is what keeps
 * that usable from the keyboard rather than a mouse-only flourish.
 *
 * The rail widens with a CSS transition on a token duration, so the
 * reduced-motion block in theme.css disables it along with everything else.
 */
export function NavRail({
  workspaces,
  activeWorkspaceId,
}: {
  readonly workspaces: readonly WorkspaceSummary[];
  readonly activeWorkspaceId: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="rule-r group/rail bg-card ease-out sticky top-0 hidden h-dvh w-(--spacing-rail) shrink-0 flex-col overflow-hidden transition-[width] duration-calm hover:w-(--spacing-rail-open) focus-within:w-(--spacing-rail-open) md:flex"
    >
      <div className="rule-b flex h-16 shrink-0 items-center gap-3 px-5">
        <span className="shrink-0">
          <Mark size={22} />
        </span>
        <span className="ease-out overflow-hidden opacity-0 transition-opacity duration-calm group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
          <Wordmark height={15} />
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-2.5">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          />
        ))}
      </ul>

      <ul className="rule-t flex flex-col gap-0.5 p-2.5">
        {SETTINGS_NAV.slice(0, 1).map((item) => (
          <NavLink key={item.href} item={item} active={pathname.startsWith('/settings')} />
        ))}
      </ul>

      <div className="rule-t ease-out overflow-hidden py-2 opacity-0 transition-opacity duration-calm group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
        <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} />
      </div>
    </nav>
  );
}

function NavLink({
  item,
  active,
}: {
  item: (typeof PRIMARY_NAV)[number];
  active: boolean;
}) {
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`ease-out group/link flex h-10 items-center gap-3.5 rounded-sm px-2.5 transition-colors duration-instant ${
          active ? 'bg-accent-weak text-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink'
        }`}
      >
        <span className="relative flex w-5 shrink-0 justify-center">
          <Icon size={17} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
          {/* Active state is carried by weight and a rule as well as colour,
              so it survives a palette where the accent is subtle. */}
          {active ? (
            <span
              aria-hidden
              className="bg-accent absolute -left-2.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
            />
          ) : null}
        </span>

        <span className="ease-out min-w-0 overflow-hidden opacity-0 transition-opacity duration-calm group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
          <span className="block truncate text-sm">{item.label}</span>
        </span>
      </Link>
    </li>
  );
}
