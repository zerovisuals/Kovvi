'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  approval,
  campaign,
  conversation,
  conversationMessage,
  message,
  opportunity,
  outcome,
  sendAttempt,
  user,
  workspace,
} from '../db/schema';
import { requireTenantOrThrow } from '../auth/guards';
import { prepareCampaign, type PrepareResult } from './prepare';
import { hashValue, recordReplyAndCancelFollowUps } from '../email/dispatch';
import { recordAudit } from '../ops/audit';
import { NotFoundError } from '../db/tenant';
import type { TenantContext } from '../db/tenant';

/**
 * The actions behind the outreach, conversation and pipeline screens.
 *
 * Two rules hold across all of them:
 *
 *  1. Approval is per message VERSION. Approving stores the hash of the body as
 *     it stands; editing writes a new hash and the stored approval stops
 *     matching. Nothing has to remember to clear a flag.
 *  2. Nothing here sends. `logManualSend` records that the USER sent something
 *     themselves — which is the only send route that exists while the email
 *     capability is absent, and is labelled as manual in the data rather than
 *     dressed up as a dispatch.
 */

export type ActionResult =
  | { readonly ok: true; readonly detail?: string }
  | { readonly ok: false; readonly detail: string };

/** Sample workspaces may prepare and approve, but never record a real send. */
async function assertRealWorkspace(ctx: TenantContext): Promise<void> {
  const [row] = await getDb()
    .select({ kind: workspace.kind })
    .from(workspace)
    .where(eq(workspace.id, ctx.workspaceId))
    .limit(1);

  if (row?.kind === 'sample') {
    throw new NotFoundError('Send');
  }
}

async function ownedMessage(ctx: TenantContext, messageId: string) {
  const [row] = await getDb()
    .select({
      id: message.id,
      body: message.body,
      bodyHash: message.bodyHash,
      version: message.version,
      campaignId: message.campaignId,
      opportunityId: message.opportunityId,
      contactId: message.contactId,
    })
    .from(message)
    .where(and(eq(message.id, messageId), eq(message.workspaceId, ctx.workspaceId)))
    .limit(1);

  if (!row) throw new NotFoundError('Message');
  return row;
}

/* ── Preparing ───────────────────────────────────────────────────────────── */

export type PrepareActionResult =
  | { readonly ok: true; readonly campaignId: string | null; readonly preparedCount: number; readonly skipped: PrepareResult['skipped'] }
  | { readonly ok: false; readonly detail: string };

export async function prepareOutreach(
  name: string,
  opportunityIds: readonly string[],
): Promise<PrepareActionResult> {
  const ctx = await requireTenantOrThrow();

  if (opportunityIds.length === 0) {
    return { ok: false, detail: 'Choose at least one organization.' };
  }

  const db = getDb();
  const [account] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, ctx.userId))
    .limit(1);

  const result = await prepareCampaign(db, ctx, {
    name: name.trim() || 'Untitled campaign',
    opportunityIds,
    senderName: account?.name?.trim() || account?.email?.split('@')[0] || 'me',
  });

  revalidatePath('/outreach');
  revalidatePath('/shortlist');

  return {
    ok: true,
    campaignId: result.campaignId,
    preparedCount: result.prepared.length,
    skipped: result.skipped,
  };
}

/* ── Approval ────────────────────────────────────────────────────────────── */

export async function approveMessage(messageId: string): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  const db = getDb();
  const target = await ownedMessage(ctx, messageId);

  await db.transaction(async (tx) => {
    // Any earlier approval is revoked rather than deleted: the record that the
    // user approved an older version is part of the audit trail.
    await tx
      .update(approval)
      .set({ revokedAt: new Date() })
      .where(and(eq(approval.messageId, messageId), isNull(approval.revokedAt)));

    await tx.insert(approval).values({
      workspaceId: ctx.workspaceId,
      messageId,
      approvedBodyHash: target.bodyHash,
      approvedByUserId: ctx.userId,
    });
  });

  await recordAudit(db, ctx, {
    action: 'message.approved',
    subjectType: 'message',
    subjectId: messageId,
    detail: `version ${target.version}`,
  });

  revalidatePath('/outreach');
  return { ok: true, detail: `Approved version ${target.version} of this message.` };
}

export async function revokeApproval(messageId: string): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  const db = getDb();
  await ownedMessage(ctx, messageId);

  await db
    .update(approval)
    .set({ revokedAt: new Date() })
    .where(and(eq(approval.messageId, messageId), isNull(approval.revokedAt)));

  await recordAudit(db, ctx, {
    action: 'message.approval_revoked',
    subjectType: 'message',
    subjectId: messageId,
  });

  revalidatePath('/outreach');
  return { ok: true, detail: 'Approval withdrawn. Nothing will go out for this message.' };
}

/**
 * Editing a message body.
 *
 * The version increments and the hash changes, which is what makes the stored
 * approval stop matching. The approval row is left intact so the review screen
 * can say "you approved an earlier version" rather than "not approved" — the
 * difference matters to someone who thinks they already signed this off.
 */
export async function editMessageBody(
  messageId: string,
  body: string,
): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return { ok: false, detail: 'A message cannot be empty.' };
  }

  const db = getDb();
  const target = await ownedMessage(ctx, messageId);

  if (trimmed === target.body) {
    return { ok: true, detail: 'Unchanged.' };
  }

  await db
    .update(message)
    .set({ body: trimmed, bodyHash: hashValue(trimmed), version: target.version + 1 })
    .where(eq(message.id, messageId));

  await recordAudit(db, ctx, {
    action: 'message.edited',
    subjectType: 'message',
    subjectId: messageId,
    detail: `now version ${target.version + 1}`,
  });

  revalidatePath('/outreach');
  return {
    ok: true,
    detail: 'Saved as a new version. Your earlier approval no longer covers this text.',
  };
}

/* ── Campaigns ───────────────────────────────────────────────────────────── */

export async function pauseCampaign(campaignId: string): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  const db = getDb();

  const updated = await db
    .update(campaign)
    .set({ status: 'paused', pauseReason: 'user_paused' })
    .where(and(eq(campaign.id, campaignId), eq(campaign.workspaceId, ctx.workspaceId)))
    .returning({ id: campaign.id });

  if (updated.length === 0) throw new NotFoundError('Campaign');

  revalidatePath('/outreach');
  return { ok: true, detail: 'Paused. Nothing further will be prepared or sent.' };
}

export async function resumeCampaign(campaignId: string): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  const db = getDb();

  const [current] = await db
    .select({ pauseReason: campaign.pauseReason })
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.workspaceId, ctx.workspaceId)))
    .limit(1);

  if (!current) throw new NotFoundError('Campaign');

  // A campaign paused because a reply arrived is not resumable by clicking
  // resume — the reason still holds, and resuming would follow up with someone
  // who already answered.
  if (current.pauseReason && current.pauseReason !== 'user_paused') {
    return {
      ok: false,
      detail: `This campaign was paused because of ${current.pauseReason.replace(/_/g, ' ')}, which has not changed. Resolve that first.`,
    };
  }

  await db
    .update(campaign)
    .set({ status: 'draft', pauseReason: null })
    .where(eq(campaign.id, campaignId));

  revalidatePath('/outreach');
  return { ok: true, detail: 'Resumed as a draft. Approvals are unaffected.' };
}

/* ── Sending, by hand ────────────────────────────────────────────────────── */

/**
 * Records that the user sent an approved message themselves.
 *
 * With no email provider connected this is the only send route in the product,
 * and it is an honest one: nothing is dispatched, a human did it, and the row
 * says `manual`. The approval hash is still checked, because logging a send of
 * text that was never approved would put an unreviewed message into the history
 * as though it had been reviewed.
 */
export async function logManualSend(messageId: string): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  await assertRealWorkspace(ctx);

  const db = getDb();
  const target = await ownedMessage(ctx, messageId);

  const [live] = await db
    .select({ approvedBodyHash: approval.approvedBodyHash })
    .from(approval)
    .where(and(eq(approval.messageId, messageId), isNull(approval.revokedAt)))
    .limit(1);

  if (!live) {
    return { ok: false, detail: 'This message has not been approved.' };
  }

  if (live.approvedBodyHash !== target.bodyHash) {
    return {
      ok: false,
      detail: 'The text has changed since it was approved. Approve the current version first.',
    };
  }

  const idempotencyKey = `manual:${messageId}:${target.bodyHash}`;

  await db.transaction(async (tx) => {
    await tx
      .insert(sendAttempt)
      .values({
        workspaceId: ctx.workspaceId,
        messageId,
        idempotencyKey,
        status: 'sent',
        manual: 'logged_by_user',
      })
      .onConflictDoNothing({ target: sendAttempt.idempotencyKey });

    const [thread] = await tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(eq(conversation.opportunityId, target.opportunityId))
      .limit(1);

    const threadId =
      thread?.id ??
      (
        await tx
          .insert(conversation)
          .values({
            workspaceId: ctx.workspaceId,
            opportunityId: target.opportunityId,
            channel: 'email',
          })
          .returning({ id: conversation.id })
      )[0]!.id;

    await tx.insert(conversationMessage).values({
      workspaceId: ctx.workspaceId,
      conversationId: threadId,
      direction: 'manual_log',
      body: target.body,
      sourceMessageId: messageId,
    });

    await tx
      .update(conversation)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversation.id, threadId));

    await tx
      .update(opportunity)
      .set({ stage: 'contacted' })
      .where(eq(opportunity.id, target.opportunityId));
  });

  await recordAudit(db, ctx, {
    action: 'message.manual_send_logged',
    subjectType: 'message',
    subjectId: messageId,
  });

  revalidatePath('/outreach');
  revalidatePath('/conversations');
  revalidatePath('/pipeline');
  return { ok: true, detail: 'Logged. The opportunity moved to contacted.' };
}

/* ── Conversations ───────────────────────────────────────────────────────── */

export async function logReply(
  opportunityId: string,
  body: string,
): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return { ok: false, detail: 'Paste the reply you received.' };
  }

  const { cancelled } = await recordReplyAndCancelFollowUps(getDb(), {
    workspaceId: ctx.workspaceId,
    opportunityId,
    channel: 'email',
    body: trimmed,
  });

  revalidatePath('/conversations');
  revalidatePath('/pipeline');

  return {
    ok: true,
    detail:
      cancelled > 0
        ? `Recorded. ${cancelled} pending follow-up${cancelled === 1 ? '' : 's'} cancelled.`
        : 'Recorded. There were no pending follow-ups.',
  };
}

/**
 * The user classifying a reply.
 *
 * Only the user. A classifier reading "this looks interesting, let me discuss
 * internally" as interest is how a prospecting tool sends someone chasing the
 * conversations that were never going anywhere — so the column defaults to
 * `unclassified` and this is the only thing that changes it.
 */
export async function classifyReply(
  conversationMessageId: string,
  intent: 'interested' | 'not_now' | 'not_interested' | 'opt_out' | 'auto_reply',
): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  const updated = await getDb()
    .update(conversationMessage)
    .set({ intent })
    .where(
      and(
        eq(conversationMessage.id, conversationMessageId),
        eq(conversationMessage.workspaceId, ctx.workspaceId),
      ),
    )
    .returning({ id: conversationMessage.id });

  if (updated.length === 0) throw new NotFoundError('Reply');

  revalidatePath('/conversations');
  return { ok: true, detail: 'Classified. This is your reading, not a guess by the system.' };
}

/* ── Pipeline ────────────────────────────────────────────────────────────── */

const STAGES = [
  'discovered',
  'shortlisted',
  'prepared',
  'approved',
  'contacted',
  'replied',
  'qualified',
  'quoted',
  'won',
  'lost',
  'suppressed',
] as const;

export type Stage = (typeof STAGES)[number];

export async function moveStage(
  opportunityId: string,
  stage: Stage,
): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  if (!STAGES.includes(stage)) {
    return { ok: false, detail: 'Unknown stage.' };
  }

  const db = getDb();
  const updated = await db
    .update(opportunity)
    .set({ stage, updatedAt: new Date() })
    .where(
      and(eq(opportunity.id, opportunityId), eq(opportunity.workspaceId, ctx.workspaceId)),
    )
    .returning({ id: opportunity.id });

  if (updated.length === 0) throw new NotFoundError('Opportunity');

  await recordAudit(db, ctx, {
    action: 'opportunity.stage_changed',
    subjectType: 'opportunity',
    subjectId: opportunityId,
    detail: stage,
  });

  revalidatePath('/pipeline');
  return { ok: true, detail: `Moved to ${stage}.` };
}

/**
 * Recording how it actually went.
 *
 * A loss reason is required for a loss. The point of the pipeline is not to
 * count outcomes but to let the freelancer see which kinds of prospect are
 * worth their afternoons, and "lost" with no reason answers nothing.
 */
export async function recordOutcome(input: {
  readonly opportunityId: string;
  readonly kind: 'won' | 'lost' | 'quoted' | 'qualified' | 'stalled';
  readonly lossReason?: string;
  readonly dealValueCents?: number;
  readonly note?: string;
}): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  if (input.kind === 'lost' && !input.lossReason?.trim()) {
    return { ok: false, detail: 'Say why it was lost — that is the part worth keeping.' };
  }

  const db = getDb();

  const [owned] = await db
    .select({ id: opportunity.id })
    .from(opportunity)
    .where(
      and(
        eq(opportunity.id, input.opportunityId),
        eq(opportunity.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);

  if (!owned) throw new NotFoundError('Opportunity');

  await db.transaction(async (tx) => {
    await tx.insert(outcome).values({
      workspaceId: ctx.workspaceId,
      opportunityId: input.opportunityId,
      kind: input.kind,
      lossReason: input.lossReason?.trim() || null,
      dealValueCents: input.dealValueCents ?? null,
      note: input.note?.trim() || null,
      recordedByUserId: ctx.userId,
    });

    if (input.kind === 'won' || input.kind === 'lost') {
      await tx
        .update(opportunity)
        .set({ stage: input.kind, updatedAt: new Date() })
        .where(eq(opportunity.id, input.opportunityId));
    }
  });

  await recordAudit(db, ctx, {
    action: 'outcome.recorded',
    subjectType: 'opportunity',
    subjectId: input.opportunityId,
    detail: input.kind,
  });

  revalidatePath('/pipeline');
  return { ok: true, detail: `Recorded as ${input.kind}.` };
}
