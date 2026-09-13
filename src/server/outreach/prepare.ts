import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  campaign,
  contact,
  message,
  opportunity,
  portfolioProject,
  serviceProfile,
  subscription,
  suppression,
  workspace,
} from '../db/schema';
import { loadDossier } from '../db/repo/dossier';
import { draftFromTemplate, DRAFTER_VERSION, UngroundedDraftError } from '../draft/template';
import { campaignEligibility, type BlockReason } from '../rank/eligibility';
import { hashValue } from '../email/dispatch';
import { recordAudit } from '../ops/audit';
import type { TenantContext } from '../db/tenant';

/**
 * Preparing a campaign.
 *
 * This is the step between research and outreach, and it is where most of the
 * product's refusals happen — so the result reports them individually rather
 * than returning a count. "9 of 14 prepared" with no explanation leaves the
 * user assuming a bug; naming the five reasons turns the same outcome into
 * information about their prospects.
 *
 * Nothing here sends, schedules or approves. It writes drafts a human will read.
 */

export type PreparedRow = {
  readonly opportunityId: string;
  readonly organization: string;
  readonly messageId: string;
  readonly omissions: readonly string[];
};

export type SkippedRow = {
  readonly opportunityId: string;
  readonly organization: string;
  readonly reason: BlockReason | 'no_evidence' | 'no_profile';
  readonly explanation: string;
};

export type PrepareResult = {
  readonly campaignId: string | null;
  readonly prepared: readonly PreparedRow[];
  readonly skipped: readonly SkippedRow[];
};

export async function prepareCampaign(
  db: Database,
  ctx: TenantContext,
  input: {
    readonly name: string;
    readonly opportunityIds: readonly string[];
    readonly senderName: string;
  },
): Promise<PrepareResult> {
  if (input.opportunityIds.length === 0) {
    return { campaignId: null, prepared: [], skipped: [] };
  }

  const [[space], [profile], representative, suppressed, [sub]] = await Promise.all([
    db.select({ kind: workspace.kind }).from(workspace).where(eq(workspace.id, ctx.workspaceId)),
    db
      .select()
      .from(serviceProfile)
      .where(eq(serviceProfile.workspaceId, ctx.workspaceId))
      .limit(1),
    db
      .select()
      .from(portfolioProject)
      .where(
        and(
          eq(portfolioProject.workspaceId, ctx.workspaceId),
          eq(portfolioProject.isRepresentative, true),
        ),
      ),
    db
      .select({ valueHash: suppression.valueHash })
      .from(suppression)
      .where(eq(suppression.workspaceId, ctx.workspaceId)),
    db
      .select({ status: subscription.status })
      .from(subscription)
      .where(eq(subscription.workspaceId, ctx.workspaceId))
      .limit(1),
  ]);

  const isSample = space?.kind === 'sample';
  const subscriptionActive = sub?.status === 'active' || sub?.status === 'trialing';
  // Suppression stores a hash, never the address itself. Comparison happens on
  // the same normalisation dispatch uses, so the two cannot disagree.
  const suppressedHashes = new Set(suppressed.map((row) => row.valueHash));

  const prepared: PreparedRow[] = [];
  const skipped: SkippedRow[] = [];

  // Created lazily, so a prepare run that produces nothing leaves no empty
  // campaign behind for the user to wonder about.
  let campaignId: string | null = null;

  for (const opportunityId of input.opportunityIds) {
    const dossier = await loadDossier(db, ctx, opportunityId);
    if (!dossier) continue;

    const organization = dossier.business.canonicalName;

    if (!profile?.confirmedAt) {
      skipped.push({
        opportunityId,
        organization,
        reason: 'no_profile',
        explanation:
          'Your service profile is not confirmed yet. Drafts cite what you do, so they cannot be written against claims you have not stood behind.',
      });
      continue;
    }

    const emailContact = dossier.contacts.find((row) => row.channel === 'email');
    const anyContact = dossier.contacts[0];
    const usableContact = emailContact ?? anyContact;

    const eligibility = campaignEligibility({
      identityConflictOpen: dossier.identityConflicts.length > 0,
      hasContact: usableContact !== undefined,
      evidenceExpired:
        dossier.evidence.length > 0 && dossier.evidence.every((row) => row.expired),
      suppressed:
        usableContact !== undefined &&
        suppressedHashes.has(hashValue(usableContact.value.trim().toLowerCase())),
      subscriptionActive,
      isSampleWorkspace: isSample,
      totalScore: dossier.opportunity.totalScore,
    });

    // A sample workspace still gets a draft: seeing the whole workflow is the
    // point of it. It is the SEND that is blocked, and that block lives in
    // dispatch, not here.
    if (!eligibility.eligible && eligibility.blockedReason !== 'sample_workspace') {
      skipped.push({
        opportunityId,
        organization,
        reason: eligibility.blockedReason!,
        explanation: eligibility.explanation,
      });

      await db
        .update(opportunity)
        .set({ blockedReason: eligibility.blockedReason })
        .where(eq(opportunity.id, opportunityId));

      continue;
    }

    const latestEvent = dossier.events[0];
    const eventEvidence = latestEvent
      ? dossier.evidence.find((row) => row.id === latestEvent.evidenceId)
      : undefined;

    const pick =
      representative.find((project) =>
        project.industryTags.includes(dossier.opportunity.moduleId),
      ) ?? representative[0];

    let draft;
    try {
      draft = draftFromTemplate({
        businessName: organization,
        senderName: input.senderName,
        senderService: profile.services[0] ?? 'website',
        portfolio: pick
          ? { title: pick.title ?? pick.url, url: pick.url, role: pick.role }
          : null,
        event:
          latestEvent && eventEvidence
            ? {
                evidenceId: eventEvidence.id,
                title: latestEvent.title ?? 'announced something',
                date: latestEvent.eventDate,
                precision: latestEvent.eventDatePrecision,
                expired: eventEvidence.expired,
                type: latestEvent.eventType,
              }
            : null,
        /* Drafts quote ASSESSMENT FINDINGS, never raw evidence excerpts.
           A finding has a sentence somebody wrote ("the product pages carry no
           size information on mobile"); an evidence excerpt is whatever the
           page happened to contain, which is usually navigation text and an
           address. Pasting the latter into a message reads exactly like the
           scrape it is — and quoting someone's own page back at them is the
           single most recognisable tell of automated outreach.

           Grounding still points at a real retrieval: the finding's own
           evidence row where it has one, otherwise the retrieval of the page
           the assessment ran against. */
        findings: dossier.findings.flatMap((row) => {
          const groundedOn = row.evidenceId ?? dossier.evidence[0]?.id;
          if (!groundedOn) return [];

          const backing = dossier.evidence.find((claim) => claim.id === groundedOn);

          return [
            {
              id: groundedOn,
              classification: row.classification,
              summary: row.summary,
              expired: backing?.expired ?? false,
            },
          ];
        }),
        contactRole: usableContact?.role ?? null,
      });
    } catch (error) {
      if (error instanceof UngroundedDraftError) {
        // The draft refused itself. That is the grounding rule working, not a
        // failure — there was nothing checkable to say.
        skipped.push({
          opportunityId,
          organization,
          reason: 'no_evidence',
          explanation:
            'Nothing current and checkable was found to write about. A message with no reason to exist is what makes outreach feel automated.',
        });
        continue;
      }
      throw error;
    }

    if (campaignId === null) {
      const [created] = await db
        .insert(campaign)
        .values({ workspaceId: ctx.workspaceId, name: input.name, channel: 'email' })
        .returning({ id: campaign.id });
      campaignId = created!.id;
    }

    const [written] = await db
      .insert(message)
      .values({
        workspaceId: ctx.workspaceId,
        campaignId,
        opportunityId,
        contactId: usableContact?.id ?? null,
        subject: draft.subject,
        body: draft.body,
        bodyHash: draft.bodyHash,
        portfolioProjectId: pick?.id ?? null,
        groundingEvidenceIds: [...draft.groundingEvidenceIds],
        generatedBy: 'template',
        drafterVersion: DRAFTER_VERSION,
      })
      .returning({ id: message.id });

    await db
      .update(opportunity)
      .set({ stage: 'prepared', blockedReason: null, portfolioProjectId: pick?.id ?? null })
      .where(eq(opportunity.id, opportunityId));

    prepared.push({
      opportunityId,
      organization,
      messageId: written!.id,
      omissions: draft.omissions,
    });
  }

  if (campaignId) {
    await recordAudit(db, ctx, {
      action: 'campaign.prepared',
      subjectType: 'campaign',
      subjectId: campaignId,
      detail: `${prepared.length} drafted, ${skipped.length} skipped`,
    });
  }

  return { campaignId, prepared, skipped };
}

/** Opportunities the user could reasonably put into a campaign right now. */
export async function preparableOpportunities(db: Database, ctx: TenantContext) {
  return db
    .select({
      id: opportunity.id,
      stage: opportunity.stage,
      totalScore: opportunity.totalScore,
      blockedReason: opportunity.blockedReason,
    })
    .from(opportunity)
    .where(
      and(
        eq(opportunity.workspaceId, ctx.workspaceId),
        eq(opportunity.excluded, false),
        inArray(opportunity.stage, ['discovered', 'shortlisted']),
      ),
    );
}

/** Exported for the review screen's "who would this go to" line. */
export async function recipientFor(db: Database, contactId: string | null) {
  if (!contactId) return undefined;
  const [row] = await db.select().from(contact).where(eq(contact.id, contactId)).limit(1);
  return row;
}

export { hashValue };
