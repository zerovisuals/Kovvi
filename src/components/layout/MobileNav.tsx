'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_NAV } from './navigation';

/**
 * Bottom navigation below the rail's breakpoint.
 *
 * Labels are always visible rather than icon-only. Six destinations named
 * "Today" and "Discover" are not self-evident from a glyph, and a prospecting
 * tool used on a phone between other work cannot afford a guessing game.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="rule-t bg-card sticky bottom-0 z-10 grid grid-cols-6 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {PRIMARY_NAV.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`ease-out flex flex-col items-center gap-1 py-2.5 transition-colors duration-instant ${
              active ? 'text-ink' : 'text-ink-faint'
            }`}
          >
            <Icon size={18} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
            <span className="text-2xs leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
