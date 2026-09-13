import {
  Compass,
  Inbox,
  ListChecks,
  MessagesSquare,
  Send,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react';

/**
 * The product's navigation, exactly as the brief specifies it:
 * Today / Discover / Shortlist / Outreach / Conversations / Pipeline, with
 * profile, saved searches, connections, billing and preferences under settings.
 *
 * The order is the workflow — find, judge, approach, talk, close — so the rail
 * reads as a sequence rather than a menu.
 *
 * Icons are `lucide-react` as a PLACEHOLDER. The brief asks for icon rules as
 * part of the identity, so this is one more thing the designer replaces; every
 * icon is referenced through this file so the swap is central.
 */

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** One line, shown in the expanded rail and as the tooltip when collapsed. */
  readonly hint: string;
};

export const PRIMARY_NAV: readonly NavItem[] = [
  {
    href: '/today',
    label: 'Today',
    icon: Sun,
    hint: 'What needs you now — not a dashboard',
  },
  {
    href: '/discover',
    label: 'Discover',
    icon: Compass,
    hint: 'Set up a research run',
  },
  {
    href: '/shortlist',
    label: 'Shortlist',
    icon: ListChecks,
    hint: 'Judge what came back',
  },
  {
    href: '/outreach',
    label: 'Outreach',
    icon: Send,
    hint: 'Review and approve messages',
  },
  {
    href: '/conversations',
    label: 'Conversations',
    icon: MessagesSquare,
    hint: 'Replies and manual logs',
  },
  {
    href: '/pipeline',
    label: 'Pipeline',
    icon: Inbox,
    hint: 'From contacted to won',
  },
];

export const SETTINGS_NAV: readonly NavItem[] = [
  { href: '/settings/profile', label: 'Profile', icon: Settings, hint: 'Services, price, regions' },
  {
    href: '/settings/searches',
    label: 'Saved searches',
    icon: Settings,
    hint: 'Monitoring and cadence',
  },
  {
    href: '/settings/connections',
    label: 'Connections',
    icon: Settings,
    hint: 'What is connected, and what is not',
  },
  { href: '/settings/billing', label: 'Billing', icon: Settings, hint: 'Allowance and usage' },
  {
    href: '/settings/preferences',
    label: 'Preferences',
    icon: Settings,
    hint: 'Theme, timezone, capacity',
  },
  { href: '/settings/data', label: 'Data', icon: Settings, hint: 'Export, audit log, deletion' },
];
