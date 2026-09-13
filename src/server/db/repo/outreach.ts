import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client';
import {
  approval,
  business,
  campaign,
  contact,
  conversation,
  conversationMessage,
  followUpSchedule,
  message,
  opportunity,
  outcome,
  sendAttempt,
} from '../schema';
import type { TenantContext } from '../tenant';

/**
 * Reads for the outreach, conversation and pipeline screens.
 *
 * These are the screens where the product asks a user to put their name on
 * something, so the reads are shaped around what has to be visible before that
 * decision: the exact body, the exact recipient, the approval state of that
 * exact version, and what is scheduled to happen afterwards. A summary count
 * of "12 messages ready" would be a worse thing to approve than nothing at all.
 *
 * Everything here is workspace-scoped at the query, not at the caller.
 */

/* ── Campaigns ───────────────────────────────────────────────────────────── */

export type CampaignSummary = {
  readonly id: string;
  readonly name: string;
  readonly channel: string;
  readonly status: string;
  readonly pauseReason: string | null;
  readonly messageCount: number;
  readonly approvedCount: number;
  readonly sentCount: number;
  readonly createdAt: Date;
};

export async function listCampaigns(
  db: Database,
  ctx: TenantContext,
): Promise<readonly CampaignSummary[]> {
  const rows = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      pauseReason: campaign.pauseReason,
      createdAt: campaign.createdAt,
      messageCount: sql<number>`count(distinct ${message.id})::int`,
      approvedCount: sql<number>`count(distinct ${approval.id}) filter (where ${approval.revokedAt} is null)::int`,
      sentCount: sql<number>`count(distinct ${sendAttempt.id}) filter (where ${sendAttempt.status} <> 'pending')::int`,
    })
    .from(campaign)
    .leftJoin(message, eq(message.campaignId, campaign.id))
    .leftJoin(approval, eq(approval.messageId, message.id))
    .leftJoin(sendAttempt, eq(sendAttempt.messageId, message.id))
    .where(eq(campaign.workspaceId, ctx.workspaceId))
    .groupBy(campaign.id)
    .orderBy(desc(campaign.createdAt));

  return rows;
}

/**
 * One message as it appears in the review batch.
 *
 * `approvedForThisVersion` compares the stored approval hash against the body
 * hash as it stands now. It is deliberately not a boolean column on the
 * message: an edit must invalidate approval by arithmetic rather than by
 * remembering to clear a flag somewhere.
 */
export type ReviewRow = {
  readonly messageId: string;
  readonly opportunityId: string;
  readonly organization: string;
  readonly region: string | null;
  readonly subject: string | null;
  readonly body: string;
  readonly version: number;
  readonly groundingCount: number;
  readonly generatedBy: string;
  readonly recipient: string | null;
  readonly recipientChannel: string | null;
  readonly recipientVerification: string | null;
  readonly approvedForThisVersion: boolean;
  readonly approvedAt: Date | null;
  readonly staleApproval: boolean;
  readonly blockedReason: string | null;
  readonly sendStatus: string | null;
  readonly pendingFollowUps: number;
};

export type CampaignReview = {
  readonly campaign: {
    readonly id: string;
    readonly name: string;
    readonly channel: string;
    readonly status: string;
    readonly pauseReason: string | null;
  };
  readonly rows: readonly ReviewRow[];
};

export async function loadCampaignReview(
  db: Database,
  ctx: TenantContext,
  campaignId: string,
): Promise<CampaignReview | undefined> {
  const [head] = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      pauseReason: campaign.pauseReason,
    })
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.workspaceId, ctx.workspaceId)))
    .limit(1);

  if (!head) return undefined;

  const rows = await db
    .select({
      messageId: message.id,
      opportunityId: message.opportunityId,
      organization: business.canonicalName,
      region: business.region,
      subject: message.subject,
      body: message.body,
      version: message.version,
      bodyHash: message.bodyHash,
      grounding: message.groundingEvidenceIds,
      generatedBy: message.generatedBy,
      recipient: contact.value,
      recipientChannel: contact.channel,
      recipientVerification: contact.verification,
      approvedHash: approval.approvedBodyHash,
      approvedAt: approval.approvedAt,
      blockedReason: opportunity.blockedReason,
      sendStatus: sendAttempt.status,
    })
    .from(message)
    .innerJoin(opportunity, eq(opportunity.id, message.opportunityId))
    .innerJoin(business, eq(business.id, opportunity.businessId))
    .leftJoin(contact, eq(contact.id, message.contactId))
    .leftJoin(
      approval,
      and(eq(approval.messageId, message.id), isNull(approval.revokedAt)),
    )
    .leftJoin(sendAttempt, eq(sendAttempt.messageId, message.id))
    .where(and(eq(message.campaignId, campaignId), eq(message.workspaceId, ctx.workspaceId)))
    .orderBy(asc(business.canonicalName));

  const messageIds = rows.map((row) => row.messageId);
  const pending =
    messageIds.length === 0
      ? []
      : await db
          .select({
            messageId: followUpSchedule.messageId,
            count: sql<number>`count(*)::int`,
          })
          .from(followUpSchedule)
          .where(
            and(
              inArray(followUpSchedule.messageId, messageIds),
              isNull(followUpSchedule.cancelledAt),
              isNull(followUpSchedule.sentAt),
            ),
          )
          .groupBy(followUpSchedule.messageId);

  const pendingByMessage = new Map(pending.map((row) => [row.messageId, row.count]));

  return {
    campaign: head,
    rows: rows.map((row) => ({
      messageId: row.messageId,
      opportunityId: row.opportunityId,
      organization: row.organization,
      region: row.region,
      subject: row.subject,
      body: row.body,
      version: row.version,
      groundingCount: row.grounding.length,
      generatedBy: row.generatedBy,
      recipient: row.recipient,
      recipientChannel: row.recipientChannel,
      recipientVerification: row.recipientVerification,
      approvedForThisVersion: row.approvedHash === row.bodyHash,
      approvedAt: row.approvedAt,
      // An approval that exists but no longer matches is worth naming
      // separately from never having been approved: the user did approve
      // something, and needs to know their edit undid it.
      staleApproval: row.approvedHash !== null && row.approvedHash !== row.bodyHash,
      blockedReason: row.blockedReason,
      sendStatus: row.sendStatus,
      pendingFollowUps: pendingByMessage.get(row.messageId) ?? 0,
    })),
  };
}

/* ── Conversations ───────────────────────────────────────────────────────── */

export type ConversationSummary = {
  readonly id: string;
  readonly opportunityId: string;
  readonly organization: string;
  readonly channel: string;
  readonly lastMessageAt: Date | null;
  readonly messageCount: number;
  readonly awaitingClassification: number;
};

export async function listConversations(
  db: Database,
  ctx: TenantContext,
): Promise<readonly ConversationSummary[]> {
  return db
    .select({
      id: conversation.id,
      opportunityId: conversation.opportunityId,
      organization: business.canonicalName,
      channel: conversation.channel,
      lastMessageAt: conversation.lastMessageAt,
      messageCount: sql<number>`count(${conversationMessage.id})::int`,
      awaitingClassification: sql<number>`count(${conversationMessage.id}) filter (where ${conversationMessage.direction} = 'inbound' and ${conversationMessage.intent} = 'unclassified')::int`,
    })
    .from(conversation)
    .innerJoin(opportunity, eq(opportunity.id, conversation.opportunityId))
    .innerJoin(business, eq(business.id, opportunity.businessId))
    .leftJoin(conversationMessage, eq(conversationMessage.conversationId, conversation.id))
    .where(eq(conversation.workspaceId, ctx.workspaceId))
    .groupBy(conversation.id, business.canonicalName)
    .orderBy(desc(conversation.lastMessageAt));
}

export type ConversationThread = {
  readonly id: string;
  readonly opportunityId: string;
  readonly organization: string;
  readonly channel: string;
  readonly messages: readonly {
    readonly id: string;
    readonly direction: string;
    readonly body: string;
    readonly occurredAt: Date;
    readonly intent: string;
  }[];
};

export async function loadConversation(
  db: Database,
  ctx: TenantContext,
  conversationId: string,
): Promise<ConversationThread | undefined> {
  const [head] = await db
    .select({
      id: conversation.id,
      opportunityId: conversation.opportunityId,
      organization: business.canonicalName,
      channel: conversation.channel,
    })
    .from(conversation)
    .innerJoin(opportunity, eq(opportunity.id, conversation.opportunityId))
    .innerJoin(business, eq(business.id, opportunity.businessId))
    .where(
      and(eq(conversation.id, conversationId), eq(conversation.workspaceId, ctx.workspaceId)),
    )
    .limit(1);

  if (!head) return undefined;

  const messages = await db
    .select({
      id: conversationMessage.id,
      direction: conversationMessage.direction,
      body: conversationMessage.body,
      occurredAt: conversationMessage.occurredAt,
      intent: conversationMessage.intent,
    })
    .from(conversationMessage)
    .where(eq(conversationMessage.conversationId, conversationId))
    .orderBy(asc(conversationMessage.occurredAt));

  return { ...head, messages };
}

/* ── Pipeline ────────────────────────────────────────────────────────────── */

export type PipelineCard = {
  readonly opportunityId: string;
  readonly organization: string;
  readonly region: string | null;
  readonly stage: string;
  readonly totalScore: number;
  readonly blockedReason: string | null;
  readonly lastActivityAt: Date;
  readonly outcomeKind: string | null;
  readonly dealValueCents: number | null;
};

export async function listPipeline(
  db: Database,
  ctx: TenantContext,
): Promise<readonly PipelineCard[]> {
  return db
    .select({
      opportunityId: opportunity.id,
      organization: business.canonicalName,
      region: business.region,
      stage: opportunity.stage,
      totalScore: opportunity.totalScore,
      blockedReason: opportunity.blockedReason,
      lastActivityAt: opportunity.updatedAt,
      outcomeKind: outcome.kind,
      dealValueCents: outcome.dealValueCents,
    })
    .from(opportunity)
    .innerJoin(business, eq(business.id, opportunity.businessId))
    .leftJoin(outcome, eq(outcome.opportunityId, opportunity.id))
    .where(and(eq(opportunity.workspaceId, ctx.workspaceId), eq(opportunity.excluded, false)))
    .orderBy(desc(opportunity.updatedAt));
}
