import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { Database } from '../client';
import {
  business,
  contact,
  identityConflict,
  opportunity,
  opportunityModuleHit,
  opportunityScoreInput,
  workspace,
} from '../schema';
import { dedupeKey, type Score } from '../../rank/score';
import type { TenantContext } from '../tenant';

/**
 * Opportunities, scoped to one workspace.
 *
 * There is deliberately no `getOpportunityById(id)`. Every function here takes
 * a `TenantContext` and filters on it, so a caller cannot accidentally read
 * another workspace's prospect list — the scoping is in the shape of the API
 * rather than in the discipline of whoever writes the next query.
 */

export type UpsertInput = {
  readonly businessId: string;
  readonly moduleId:
    | 'fashion'
    | 'creators'
    | 'hospitality'
    | 'local_services'
    | 'professional'
    | 'software'
    | 'esports'
    | 'custom';
  readonly runId?: string | null;
  readonly score: Score;
  readonly portfolioProjectId?: string | null;
  readonly matchExplanation?: readonly { reason: string; claimIds?: string[] }[];
  readonly dataOrigin?: 'real' | 'sample';
};

export type UpsertResult = {
  readonly opportunityId: string;
  /** False when this business was already on the list from another module. */
  readonly created: boolean;
  /** Which modules have now surfaced it. */
  readonly moduleIds: readonly string[];
};

/**
 * Records that a module surfaced a business for this workspace.
 *
 * ACCEPTANCE CASE 15. The dedupe key comes from the business identity alone, so
 * an apparel brand that also runs an esports team — found by the fashion module
 * and again by the esports module — is ONE opportunity. It appears once in the
 * shortlist, it is assessed once, and it is charged once. The second module's
 * involvement is recorded as a hit rather than as a second prospect.
 */
export async function upsertOpportunity(
  db: Database,
  ctx: TenantContext,
  input: UpsertInput,
): Promise<UpsertResult> {
  const key = dedupeKey(input.businessId);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: opportunity.id })
      .from(opportunity)
      .where(
        and(eq(opportunity.workspaceId, ctx.workspaceId), eq(opportunity.dedupeKey, key)),
      )
      .limit(1);

    let opportunityId = existing?.id;
    let created = false;

    if (!opportunityId) {
      const [inserted] = await tx
        .insert(opportunity)
        .values({
          workspaceId: ctx.workspaceId,
          businessId: input.businessId,
          moduleId: input.moduleId,
          dedupeKey: key,
          fitScore: component(input.score, 'fit'),
          evidenceScore: component(input.score, 'evidence'),
          timingScore: component(input.score, 'timing'),
          activityScore: component(input.score, 'activity'),
          contactabilityScore: component(input.score, 'contactability'),
          totalScore: input.score.total,
          confidenceBand: input.score.confidence,
          portfolioProjectId: input.portfolioProjectId ?? null,
          matchExplanation: [...(input.matchExplanation ?? [])],
          dataOrigin: input.dataOrigin ?? 'real',
        })
        .returning({ id: opportunity.id });

      opportunityId = inserted?.id;
      created = true;

      if (opportunityId) {
        await tx.insert(opportunityScoreInput).values(
          input.score.components.map((item) => ({
            opportunityId: opportunityId!,
            component: item.component,
            label: item.label,
            contribution: item.contribution,
            evidenceId: item.evidenceId ?? null,
          })),
        );
      }
    }

    if (!opportunityId) throw new Error('Failed to record the opportunity');

    // Idempotent: a module that surfaces the same business twice in one run
    // adds nothing the second time.
    await tx
      .insert(opportunityModuleHit)
      .values({
        opportunityId,
        moduleId: input.moduleId,
        runId: input.runId ?? null,
      })
      .onConflictDoNothing();

    const hits = await tx
      .select({ moduleId: opportunityModuleHit.moduleId })
      .from(opportunityModuleHit)
      .where(eq(opportunityModuleHit.opportunityId, opportunityId));

    return { opportunityId, created, moduleIds: hits.map((hit) => hit.moduleId) };
  });
}

function component(score: Score, name: string): number {
  return score.components.find((item) => item.component === name)?.contribution ?? 0;
}

export type ShortlistRow = {
  readonly id: string;
  readonly businessName: string;
  readonly region: string | null;
  readonly moduleId: string;
  readonly totalScore: number;
  readonly confidenceBand: 'high' | 'medium' | 'low';
  readonly stage: string;
  readonly blockedReason: string | null;
  readonly dataOrigin: 'real' | 'sample';
  readonly moduleIds: readonly string[];
  readonly hasContact: boolean;
  readonly identityConflictOpen: boolean;
};

/**
 * The shortlist for one workspace.
 *
 * A REAL workspace never sees sample rows, enforced here rather than in the UI.
 * Filtering in a component would leave the data one forgotten `where` clause
 * away from presenting invented businesses as research.
 */
export async function listOpportunities(
  db: Database,
  ctx: TenantContext,
  options: { limit?: number; includeExcluded?: boolean } = {},
): Promise<ShortlistRow[]> {
  const [current] = await db
    .select({ kind: workspace.kind })
    .from(workspace)
    .where(eq(workspace.id, ctx.workspaceId))
    .limit(1);

  const isSampleWorkspace = current?.kind === 'sample';

  const rows = await db
    .select({
      id: opportunity.id,
      businessId: opportunity.businessId,
      businessName: business.canonicalName,
      region: business.region,
      moduleId: opportunity.moduleId,
      totalScore: opportunity.totalScore,
      confidenceBand: opportunity.confidenceBand,
      stage: opportunity.stage,
      blockedReason: opportunity.blockedReason,
      dataOrigin: opportunity.dataOrigin,
      excluded: opportunity.excluded,
    })
    .from(opportunity)
    .innerJoin(business, eq(business.id, opportunity.businessId))
    .where(
      and(
        eq(opportunity.workspaceId, ctx.workspaceId),
        // The line that keeps invented businesses out of real research.
        eq(opportunity.dataOrigin, isSampleWorkspace ? 'sample' : 'real'),
        options.includeExcluded ? undefined : eq(opportunity.excluded, false),
      ),
    )
    .orderBy(desc(opportunity.totalScore))
    .limit(options.limit ?? 100);

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const businessIds = rows.map((row) => row.businessId);

  const [hits, contacts, conflicts] = await Promise.all([
    db
      .select({
        opportunityId: opportunityModuleHit.opportunityId,
        moduleId: opportunityModuleHit.moduleId,
      })
      .from(opportunityModuleHit)
      .where(inArray(opportunityModuleHit.opportunityId, ids)),
    db
      .select({ businessId: contact.businessId })
      .from(contact)
      .where(inArray(contact.businessId, businessIds)),
    db
      .select({
        businessId: identityConflict.businessId,
        otherBusinessId: identityConflict.otherBusinessId,
      })
      .from(identityConflict)
      .where(
        and(
          eq(identityConflict.status, 'open'),
          or(
            inArray(identityConflict.businessId, businessIds),
            inArray(identityConflict.otherBusinessId, businessIds),
          ),
        ),
      ),
  ]);

  const hitsByOpportunity = new Map<string, string[]>();
  for (const hit of hits) {
    hitsByOpportunity.set(hit.opportunityId, [
      ...(hitsByOpportunity.get(hit.opportunityId) ?? []),
      hit.moduleId,
    ]);
  }

  const contactable = new Set(contacts.map((row) => row.businessId));
  const conflicted = new Set(
    conflicts.flatMap((row) => [row.businessId, row.otherBusinessId]),
  );

  return rows.map((row) => ({
    id: row.id,
    businessName: row.businessName,
    region: row.region,
    moduleId: row.moduleId,
    totalScore: row.totalScore,
    confidenceBand: row.confidenceBand,
    stage: row.stage,
    blockedReason: row.blockedReason,
    dataOrigin: row.dataOrigin,
    moduleIds: hitsByOpportunity.get(row.id) ?? [row.moduleId],
    hasContact: contactable.has(row.businessId),
    identityConflictOpen: conflicted.has(row.businessId),
  }));
}

/**
 * One opportunity, or `undefined` when it belongs to another workspace.
 *
 * Returns undefined rather than throwing "forbidden", consistently: a response
 * that distinguishes "not yours" from "does not exist" tells a prober that it
 * exists.
 */
export async function getOpportunityForWorkspace(
  db: Database,
  ctx: TenantContext,
  opportunityId: string,
) {
  const [row] = await db
    .select()
    .from(opportunity)
    .where(
      and(eq(opportunity.id, opportunityId), eq(opportunity.workspaceId, ctx.workspaceId)),
    )
    .limit(1);

  return row;
}
