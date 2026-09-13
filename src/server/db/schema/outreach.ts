import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  campaignPauseReason,
  campaignStatus,
  contactChannel,
  drafter,
  messageDirection,
  outcomeKind,
  replyIntent,
  sendStatus,
} from './enums';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { workspace, user } from './tenancy';
import { opportunity } from './opportunity';
import { contact } from './contacts';
import { portfolioProject } from './profile';

/**
 * Outreach, approval, and what came back.
 *
 * The brief is unambiguous here: the user approves a specific recipient set and
 * a specific message, and any material change to an approved message requires
 * approval again. There is deliberately no "autopilot" concept anywhere in this
 * schema — approval is per message version, and enforced by hash.
 */

export const campaign = pgTable(
  'campaign',
  {
    id: id('campaign'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    channel: contactChannel('channel').notNull(),
    status: campaignStatus('status').notNull().default('draft'),
    /** Why a campaign stopped. Rendered as the "paused campaign" state. */
    pauseReason: campaignPauseReason('pause_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('campaign_workspace_idx').on(table.workspaceId, table.status)],
);

/**
 * One drafted message to one contact.
 *
 * `groundingEvidenceIds` is CHECK-constrained non-empty. A model may write the
 * prose — `drafter` allows `'llm'` — but it may not invent the facts the prose
 * rests on, and a draft that cites nothing physically cannot be stored. That is
 * the structural counterpart to `evidence.origin` having no `'llm'` value.
 */
export const message = pgTable(
  'message',
  {
    id: id('message'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaign.id, { onDelete: 'cascade' }),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunity.id, { onDelete: 'cascade' }),
    contactId: text('contact_id').references(() => contact.id, { onDelete: 'set null' }),

    /** Incremented on every edit; approval is tied to a specific version. */
    version: integer('version').notNull().default(1),

    subject: text('subject'),
    body: text('body').notNull(),
    /** SHA-256 of the body. Compared against the approval before dispatch. */
    bodyHash: text('body_hash').notNull(),

    /** The portfolio work this message cites. */
    portfolioProjectId: text('portfolio_project_id').references(() => portfolioProject.id, {
      onDelete: 'set null',
    }),

    /** Evidence ids the claims in this message rest on. Never empty. */
    groundingEvidenceIds: text('grounding_evidence_ids').array().notNull(),

    generatedBy: drafter('generated_by').notNull().default('template'),
    drafterVersion: text('drafter_version'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'message_must_be_grounded',
      sql`array_length(grounding_evidence_ids, 1) >= 1`,
    ),
    index('message_campaign_idx').on(table.campaignId),
    index('message_opportunity_idx').on(table.opportunityId),
  ],
);

/**
 * A human approving one exact message body.
 *
 * Dispatch compares `message.bodyHash` against `approvedBodyHash`; if they
 * differ the message was edited after approval and will not send. That is how
 * "any material change requires approval again" becomes a mechanism rather than
 * a promise.
 */
export const approval = pgTable(
  'approval',
  {
    id: id('approval'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    approvedBodyHash: text('approved_body_hash').notNull(),
    approvedByUserId: text('approved_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamptz('approved_at').notNull().defaultNow(),
    revokedAt: timestamptz('revoked_at'),
  },
  (table) => [index('approval_message_idx').on(table.messageId)],
);

export const sendAttempt = pgTable(
  'send_attempt',
  {
    id: id('sendAttempt'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),

    /** One send per key, however many times a retry or webhook is delivered. */
    idempotencyKey: text('idempotency_key').notNull(),

    providerMessageId: text('provider_message_id'),
    status: sendStatus('status').notNull().default('pending'),
    failureCode: text('failure_code'),
    failureDetail: text('failure_detail'),

    attemptedAt: timestamptz('attempted_at').notNull().defaultNow(),
    /** Set when the send was logged by hand rather than dispatched by us. */
    manual: text('manual'),
  },
  (table) => [
    uniqueIndex('send_attempt_idempotency_unique').on(table.idempotencyKey),
    index('send_attempt_message_idx').on(table.messageId),
  ],
);

/**
 * Scheduled follow-ups.
 *
 * A reply, an opt-out or a bounce cancels every future row in the same
 * transaction that records it — acceptance case 8. Following up on someone who
 * already answered is the fastest way to make a prospecting tool look automated
 * in the worst sense.
 */
export const followUpSchedule = pgTable(
  'follow_up_schedule',
  {
    id: id('followUp'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    stepNumber: integer('step_number').notNull().default(1),
    scheduledAt: timestamptz('scheduled_at').notNull(),
    sentAt: timestamptz('sent_at'),
    cancelledAt: timestamptz('cancelled_at'),
    cancelReason: text('cancel_reason'),
  },
  (table) => [
    index('follow_up_due_idx')
      .on(table.scheduledAt)
      .where(sql`cancelled_at IS NULL AND sent_at IS NULL`),
    index('follow_up_message_idx').on(table.messageId),
  ],
);

export const conversation = pgTable(
  'conversation',
  {
    id: id('conversation'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunity.id, { onDelete: 'cascade' }),
    channel: contactChannel('channel').notNull(),
    externalThreadId: text('external_thread_id'),
    lastMessageAt: timestamptz('last_message_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('conversation_workspace_idx').on(table.workspaceId, table.lastMessageAt),
    index('conversation_opportunity_idx').on(table.opportunityId),
  ],
);

export const conversationMessage = pgTable(
  'conversation_message',
  {
    id: id('conversationMessage'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),

    direction: messageDirection('direction').notNull(),
    body: text('body').notNull(),
    occurredAt: timestamptz('occurred_at').notNull().defaultNow(),

    /** Links an outbound row back to the approved message it came from. */
    sourceMessageId: text('source_message_id').references(() => message.id, {
      onDelete: 'set null',
    }),

    /**
     * Defaults to `unclassified` and is only ever set by the user. A polite
     * brush-off reads a great deal like interest to a classifier, and guessing
     * wrong sends the user chasing exactly the conversations that were never
     * going anywhere.
     */
    intent: replyIntent('intent').notNull().default('unclassified'),

    createdAt: createdAt(),
  },
  (table) => [index('conversation_message_thread_idx').on(table.conversationId, table.occurredAt)],
);

export const outcome = pgTable(
  'outcome',
  {
    id: id('outcome'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunity.id, { onDelete: 'cascade' }),

    kind: outcomeKind('kind').notNull(),
    lossReason: text('loss_reason'),
    dealValueCents: integer('deal_value_cents'),
    currency: text('currency').notNull().default('EUR'),
    note: text('note'),

    recordedByUserId: text('recorded_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    recordedAt: timestamptz('recorded_at').notNull().defaultNow(),
  },
  (table) => [index('outcome_opportunity_idx').on(table.opportunityId)],
);

export const campaignRelations = relations(campaign, ({ many, one }) => ({
  workspace: one(workspace, { fields: [campaign.workspaceId], references: [workspace.id] }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ many, one }) => ({
  campaign: one(campaign, { fields: [message.campaignId], references: [campaign.id] }),
  opportunity: one(opportunity, {
    fields: [message.opportunityId],
    references: [opportunity.id],
  }),
  contact: one(contact, { fields: [message.contactId], references: [contact.id] }),
  approvals: many(approval),
  sendAttempts: many(sendAttempt),
  followUps: many(followUpSchedule),
}));

export const conversationRelations = relations(conversation, ({ many, one }) => ({
  opportunity: one(opportunity, {
    fields: [conversation.opportunityId],
    references: [opportunity.id],
  }),
  messages: many(conversationMessage),
}));

export const conversationMessageRelations = relations(conversationMessage, ({ one }) => ({
  conversation: one(conversation, {
    fields: [conversationMessage.conversationId],
    references: [conversation.id],
  }),
}));
