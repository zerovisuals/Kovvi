import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { Database } from '../client';
import {
  assessment,
  business,
  capture,
  contact,
  event,
  evidence,
  finding,
  identityConflict,
  opportunity,
  opportunityModuleHit,
  opportunityScoreInput,
  sourceRecord,
  websiteCandidate,
} from '../schema';
import type { TenantContext } from '../tenant';
import { describeAge } from '../../evidence/dates';

/**
 * Everything needed to judge one opportunity, in one query set.
 *
 * The dossier is loaded whole rather than lazily because the entire point of
 * the screen is that checking a source costs nothing — a click that triggers a
 * request would put latency between a claim and its evidence, and latency is
 * exactly what stops people checking.
 */

export type DossierEvidence = {
  readonly id: string;
  readonly claimKey: string;
  readonly classification: 'objective_defect' | 'subjective_observation' | 'commercial_hypothesis';
  readonly confidence: 'high' | 'medium' | 'low';
  readonly excerpt: string | null;
  readonly observedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly retrievedAt: Date;
  /** Relative age, computed here so the client never touches the clock. */
  readonly ageLabel: string;
  /** Past its freshness window. Same reasoning: the clock lives server-side. */
  readonly expired: boolean;
  readonly injectionFlagged: boolean;
};

export type Dossier = NonNullable<Awaited<ReturnType<typeof loadDossier>>>;

export async function loadDossier(
  db: Database,
  ctx: TenantContext,
  opportunityId: string,
) {
  const [head] = await db
    .select({
      opportunity,
      business,
    })
    .from(opportunity)
    .innerJoin(business, eq(business.id, opportunity.businessId))
    .where(
      and(eq(opportunity.id, opportunityId), eq(opportunity.workspaceId, ctx.workspaceId)),
    )
    .limit(1);

  // Undefined rather than a distinct "forbidden": telling a caller that a
  // record exists but is not theirs confirms that it exists.
  if (!head) return undefined;

  const businessId = head.business.id;
  // One clock reading for the whole dossier, so every freshness decision on the
  // page is made against the same instant.
  const now = Date.now();

  const [
    evidenceRows,
    eventRows,
    candidates,
    contacts,
    scoreInputs,
    moduleHits,
    conflicts,
  ] = await Promise.all([
    db
      .select({
        id: evidence.id,
        claimKey: evidence.claimKey,
        classification: evidence.classification,
        confidence: evidence.confidence,
        excerpt: evidence.excerpt,
        observedAt: evidence.observedAt,
        expiresAt: evidence.expiresAt,
        sourceUrl: sourceRecord.url,
        retrievedAt: sourceRecord.retrievedAt,
        injectionFlagged: sourceRecord.injectionFlagged,
        injectionDetail: sourceRecord.injectionDetail,
      })
      .from(evidence)
      .innerJoin(sourceRecord, eq(sourceRecord.id, evidence.sourceRecordId))
      .where(eq(evidence.businessId, businessId))
      .orderBy(desc(evidence.createdAt)),

    db
      .select()
      .from(event)
      .where(eq(event.businessId, businessId))
      .orderBy(desc(event.eventDate)),

    db
      .select()
      .from(websiteCandidate)
      .where(eq(websiteCandidate.businessId, businessId))
      .orderBy(desc(websiteCandidate.createdAt)),

    db.select().from(contact).where(eq(contact.businessId, businessId)),

    db
      .select()
      .from(opportunityScoreInput)
      .where(eq(opportunityScoreInput.opportunityId, opportunityId)),

    db
      .select()
      .from(opportunityModuleHit)
      .where(eq(opportunityModuleHit.opportunityId, opportunityId)),

    db
      .select()
      .from(identityConflict)
      .where(
        and(
          eq(identityConflict.status, 'open'),
          or(
            eq(identityConflict.businessId, businessId),
            eq(identityConflict.otherBusinessId, businessId),
          ),
        ),
      ),
  ]);

  const candidateIds = candidates.map((row) => row.id);

  const assessments = candidateIds.length
    ? await db
        .select()
        .from(assessment)
        .where(inArray(assessment.websiteCandidateId, candidateIds))
        .orderBy(desc(assessment.startedAt))
    : [];

  const assessmentIds = assessments.map((row) => row.id);

  const [findings, captures] = await Promise.all([
    assessmentIds.length
      ? db.select().from(finding).where(inArray(finding.assessmentId, assessmentIds))
      : Promise.resolve([]),
    assessmentIds.length
      ? db.select().from(capture).where(inArray(capture.assessmentId, assessmentIds))
      : Promise.resolve([]),
  ]);

  const latestAssessment = assessments[0];

  return {
    opportunity: head.opportunity,
    business: head.business,
    evidence: evidenceRows.map(
      (row): DossierEvidence => ({
        id: row.id,
        claimKey: row.claimKey,
        classification: row.classification,
        confidence: row.confidence,
        excerpt: row.excerpt,
        observedAt: row.observedAt,
        expiresAt: row.expiresAt,
        sourceUrl: row.sourceUrl,
        sourceLabel: safeHost(row.sourceUrl),
        retrievedAt: row.retrievedAt,
        ageLabel: describeAge(row.retrievedAt, 'day'),
        expired: row.expiresAt !== null && row.expiresAt.getTime() < now,
        injectionFlagged: row.injectionFlagged,
      }),
    ),
    events: eventRows,
    candidate: candidates[0],
    assessment: latestAssessment,
    findings: findings.filter((row) => row.assessmentId === latestAssessment?.id),
    captures: captures.filter((row) => row.assessmentId === latestAssessment?.id),
    contacts,
    scoreInputs,
    moduleIds: moduleHits.map((row) => row.moduleId),
    identityConflicts: conflicts,
    injectionNotice: evidenceRows.find((row) => row.injectionFlagged)?.injectionDetail ?? null,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}
