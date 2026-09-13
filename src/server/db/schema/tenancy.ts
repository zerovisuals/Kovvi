import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import { capacityState, memberRole, workspaceKind } from './enums';
import { createdAt, id, timestamptz, updatedAt } from './columns';

/**
 * Accounts and tenancy.
 *
 * A workspace is the unit of isolation, billing and sample-ness. Every private
 * record in the product carries `workspaceId` and is reached through
 * `withTenant`, which scopes reads and writes automatically.
 */

export const user = pgTable(
  'user',
  {
    id: id('user'),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('user_email_unique').on(table.email)],
);

export const session = pgTable(
  'session',
  {
    id: id('session'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Hashed, never the raw cookie value — a leaked table must not grant access. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (table) => [
    unique('session_token_hash_unique').on(table.tokenHash),
    index('session_user_idx').on(table.userId),
    index('session_expires_idx').on(table.expiresAt),
  ],
);

/** Password credentials, kept out of `user` so the row can be read freely. */
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    passwordHash: text('password_hash'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('account_provider_unique').on(table.providerId, table.accountId)],
);

export const workspace = pgTable(
  'workspace',
  {
    id: id('workspace'),
    name: text('name').notNull(),
    /**
     * `sample` workspaces hold seeded demonstration data. The distinction lives
     * here rather than in the UI so it propagates to every child record and can
     * be filtered, exported and deleted as a unit.
     */
    kind: workspaceKind('kind').notNull().default('real'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Soft delete, so an export can still be honoured after cancellation. */
    deletedAt: timestamptz('deleted_at'),
  },
  (table) => [index('workspace_kind_idx').on(table.kind)],
);

export const membership = pgTable(
  'membership',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('owner'),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('membership_user_idx').on(table.userId),
  ],
);

export const workspacePreference = pgTable('workspace_preference', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('UTC'),
  locale: text('locale').notNull().default('en'),
  /**
   * Freelancers stop prospecting when they are booked. Monitoring pauses on
   * `booked` rather than continuing to generate opportunities nobody can take.
   */
  capacity: capacityState('capacity').notNull().default('open'),
  /** Overrides the OS preference for users whose system setting is wrong for them. */
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  /** Results per research run the user is willing to pay for by default. */
  defaultRunCap: integer('default_run_cap').notNull().default(25),
  updatedAt: updatedAt(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  memberships: many(membership),
}));

export const workspaceRelations = relations(workspace, ({ many, one }) => ({
  memberships: many(membership),
  preference: one(workspacePreference, {
    fields: [workspace.id],
    references: [workspacePreference.workspaceId],
  }),
}));

export const membershipRelations = relations(membership, ({ one }) => ({
  workspace: one(workspace, {
    fields: [membership.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, { fields: [membership.userId], references: [user.id] }),
}));
