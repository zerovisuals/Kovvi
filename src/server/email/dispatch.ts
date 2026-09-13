import { createHash } from 'node:crypto';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  approval,
  conversation,
  conversationMessage,
  followUpSchedule,
  message,
  sendAttempt,
  suppression,
} from '../db/schema';
import { capabilityState } from '../capabilities/registry';

/**
 * THE DISPATCH GATE
 *
 * Everything that must be true before a message leaves, checked in ONE
 * transaction with the send record.
 *
 * Checking earlier is not good enough. A campaign is approved, scheduled, and
 * then — in the minutes or days before it goes out — the recipient replies, or
 * opts out, or the sender edits the copy. Each of those invalidates a decision
 * that was correct when it was made. So the checks run against the state at the
 * instant of sending, inside the same transaction that records it.
 *
 * `sendAttempt.idempotencyKey` is UNIQUE, so a retried job or a replayed
 * webhook cannot produce a second send however many times it is delivered.
 */

export type DispatchRefusal =
  | 'capability_absent'
  | 'not_approved'
  | 'edited_after_approval'
  | 'suppressed'
  | 'already_sent'
  | 'reply_received'
  | 'no_contact';

export type DispatchDecision =
  | { readonly kind: 'send'; readonly messageId: string; readonly idempotencyKey: string }
  | { readonly kind: 'refuse'; readonly reason: DispatchRefusal; readonly detail: string };

export function hashValue(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Decides whether one message may be sent, right now.
 *
 * Pure decision, no side effects — so it can be called to EXPLAIN a refusal on
 * the review screen, using exactly the logic that will run at dispatch. Two
 * versions of this check would eventually disagree, and the disagreement would
 * be discovered by someone receiving mail they opted out of.
 */
export async function decideDispatch(
  db: Database,
  messageId: string,
  options: { readonly requireCapability?: boolean } = {},
): Promise<DispatchDecision> {
  if (options.requireCapability !== false && capabilityState('email_sending').state !== 'live') {
    return {
      kind: 'refuse',
      reason: 'capability_absent',
      detail:
        'Email sending is not connected. The message can be copied or logged as a manual send.',
    };
  }

  const [row] = await db
    .select({
      messageId: message.id,
      workspaceId: message.workspaceId,
      opportunityId: message.opportunityId,
      contactId: message.contactId,
      bodyHash: message.bodyHash,
    })
    .from(message)
    .where(eq(message.id, messageId))
    .limit(1);

  if (!row) {
    return { kind: 'refuse', reason: 'not_approved', detail: 'The message no longer exists.' };
  }

  if (!row.contactId) {
    return {
      kind: 'refuse',
      reason: 'no_contact',
      detail: 'No contact is attached to this message.',
    };
  }

  /* ── Approved, and approved for THIS text ────────────────────────────────
     Comparing hashes is what makes "any material change requires approval
     again" a mechanism rather than a promise: editing the body changes the
     hash, and the standing approval stops matching. */
  const [approved] = await db
    .select({ approvedBodyHash: approval.approvedBodyHash })
    .from(approval)
    .where(and(eq(approval.messageId, messageId), isNull(approval.revokedAt)))
    .limit(1);

  if (!approved) {
    return { kind: 'refuse', reason: 'not_approved', detail: 'This message has not been approved.' };
  }

  if (approved.approvedBodyHash !== row.bodyHash) {
    return {
      kind: 'refuse',
      reason: 'edited_after_approval',
      detail: 'The message was edited after it was approved. Approve the new version to send it.',
    };
  }

  /* ── Already sent ─────────────────────────────────────────────────────── */
  const [existing] = await db
    .select({ id: sendAttempt.id })
    .from(sendAttempt)
    .where(and(eq(sendAttempt.messageId, messageId), eq(sendAttempt.status, 'sent')))
    .limit(1);

  if (existing) {
    return { kind: 'refuse', reason: 'already_sent', detail: 'This message has already been sent.' };
  }

  /* ── A reply cancels everything that follows ──────────────────────────── */
  const [replied] = await db
    .select({ id: conversationMessage.id })
    .from(conversationMessage)
    .innerJoin(conversation, eq(conversation.id, conversationMessage.conversationId))
    .where(
      and(
        eq(conversation.opportunityId, row.opportunityId),
        eq(conversationMessage.direction, 'inbound'),
      ),
    )
    .limit(1);

  if (replied) {
    return {
      kind: 'refuse',
      reason: 'reply_received',
      detail: 'They already replied. Following up now would look automated, because it would be.',
    };
  }

  return {
    kind: 'send',
    messageId,
    // Derived from the message id, so a retry produces the same key and the
    // unique index collapses the duplicate.
    idempotencyKey: `send:${messageId}`,
  };
}

/**
 * Records an inbound reply and cancels every scheduled follow-up for that
 * opportunity — in ONE transaction.
 *
 * ACCEPTANCE CASE 8. Split across two statements, a crash between them leaves
 * follow-ups armed against someone who has already answered, which is the
 * single most irritating thing a prospecting tool can do.
 */
export async function recordReplyAndCancelFollowUps(
  db: Database,
  input: {
    readonly workspaceId: string;
    readonly opportunityId: string;
    readonly channel: 'email' | 'discord' | 'instagram' | 'linkedin' | 'x' | 'phone' | 'other';
    readonly body: string;
    readonly occurredAt?: Date;
    readonly sourceMessageId?: string | null;
  },
): Promise<{ readonly cancelled: number }> {
  return db.transaction(async (tx) => {
    const [thread] =
      (await tx
        .select({ id: conversation.id })
        .from(conversation)
        .where(eq(conversation.opportunityId, input.opportunityId))
        .limit(1)) ?? [];

    const conversationId =
      thread?.id ??
      (
        await tx
          .insert(conversation)
          .values({
            workspaceId: input.workspaceId,
            opportunityId: input.opportunityId,
            channel: input.channel,
            lastMessageAt: input.occurredAt ?? new Date(),
          })
          .returning({ id: conversation.id })
      )[0]!.id;

    await tx.insert(conversationMessage).values({
      workspaceId: input.workspaceId,
      conversationId,
      direction: 'inbound',
      body: input.body,
      occurredAt: input.occurredAt ?? new Date(),
      sourceMessageId: input.sourceMessageId ?? null,
      // Never guessed. A polite brush-off reads a great deal like interest.
      intent: 'unclassified',
    });

    const cancelled = await tx
      .update(followUpSchedule)
      .set({
        cancelledAt: new Date(),
        cancelReason: 'They replied.',
      })
      .from(message)
      .where(
        and(
          eq(followUpSchedule.messageId, message.id),
          eq(message.opportunityId, input.opportunityId),
          isNull(followUpSchedule.cancelledAt),
          isNull(followUpSchedule.sentAt),
        ),
      )
      .returning({ id: followUpSchedule.id });

    await tx
      .update(conversation)
      .set({ lastMessageAt: input.occurredAt ?? new Date(), updatedAt: new Date() })
      .where(eq(conversation.id, conversationId));

    return { cancelled: cancelled.length };
  });
}

/**
 * Records an opt-out: suppresses the address and cancels pending follow-ups.
 *
 * Suppression is permanent by default and cannot be overridden in the product.
 */
export async function recordOptOut(
  db: Database,
  input: {
    readonly workspaceId: string;
    readonly opportunityId: string;
    readonly contactValue: string;
    readonly reason?: 'opt_out' | 'bounce' | 'complaint';
  },
): Promise<{ readonly cancelled: number }> {
  return db.transaction(async (tx) => {
    await tx
      .insert(suppression)
      .values({
        workspaceId: input.workspaceId,
        scope: 'email',
        valueHash: hashValue(input.contactValue),
        reason: input.reason ?? 'opt_out',
        // Null expiry: an opt-out does not lapse.
        expiresAt: null,
      })
      .onConflictDoNothing();

    const cancelled = await tx
      .update(followUpSchedule)
      .set({ cancelledAt: new Date(), cancelReason: 'They opted out.' })
      .from(message)
      .where(
        and(
          eq(followUpSchedule.messageId, message.id),
          eq(message.opportunityId, input.opportunityId),
          isNull(followUpSchedule.cancelledAt),
          isNull(followUpSchedule.sentAt),
        ),
      )
      .returning({ id: followUpSchedule.id });

    return { cancelled: cancelled.length };
  });
}

/** True when this address must not be contacted from this workspace. */
export async function isSuppressed(
  db: Database,
  workspaceId: string,
  value: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: suppression.id })
    .from(suppression)
    .where(
      and(
        eq(suppression.valueHash, hashValue(value)),
        // A null workspace is a global suppression — a hard bounce or a
        // complaint applies to everyone, because one user's mistake should not
        // become another user's problem.
        or(eq(suppression.workspaceId, workspaceId), isNull(suppression.workspaceId)),
        or(isNull(suppression.expiresAt), gt(suppression.expiresAt, sql`now()`)),
      ),
    )
    .limit(1);

  return Boolean(row);
}
