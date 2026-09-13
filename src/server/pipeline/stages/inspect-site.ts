import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { defineStage, inconclusive, ok, type StageResult } from '../stage';
import { assessment, capture, finding, websiteCandidate } from '../../db/schema';
import { inspectWebsite, ENGINE_VERSION } from '../../inspect/inspect';
import { deriveFindings, RULESET_VERSION } from '../../inspect/findings';
import { captureKey, getBlobStore } from '../../storage/blob';
import { blobObject } from '../../db/schema';
import { recordCacheHit } from '../../billing/usage';
import type { Database } from '../../db/client';

/**
 * INSPECT SITE — the one stage that costs real money.
 *
 * Loads a confirmed website in a browser, records what was observed, and stores
 * the captures. Everything it writes is traceable to something it actually saw.
 *
 * Two behaviours here are load-bearing rather than incidental:
 *
 *  1. A fresh assessment of the same site is REUSED and not charged again. Two
 *     users researching the same restaurant should not each pay to inspect it,
 *     and the same user re-running a search within the freshness window should
 *     not pay twice either. The ledger records the reuse explicitly so it is
 *     visible rather than taken on trust (acceptance case 15).
 *  2. An inconclusive inspection writes an assessment row with ZERO findings.
 *     Not "no findings because we found nothing wrong" — no findings because we
 *     did not see the site (acceptance case 4).
 */

const input = z.object({
  websiteCandidateId: z.string(),
  url: z.string().url(),
  /** How recent an existing assessment must be to be reused, in days. */
  freshnessDays: z.number().int().positive().default(14),
});

const output = z.object({
  assessmentId: z.string(),
  outcome: z.string(),
  findingCount: z.number().int().nonnegative(),
  captureCount: z.number().int().nonnegative(),
  reused: z.boolean(),
});

type Input = z.infer<typeof input>;
type Output = z.infer<typeof output>;

export const inspectSiteStage = defineStage<Input, Output>({
  id: 'inspect_site',
  input,
  output,
  capability: 'website_inspection',
  maxAttempts: 2,
  // Comfortably above the inspector's own 45s budget, so its internal timeout
  // (which produces an honest `inconclusive`) fires before the runner's.
  timeoutMs: 90_000,

  cost: () => ({ unitType: 'deep_assessment', units: 1 }),

  async run(params, ctx): Promise<StageResult<Output>> {
    const db = ctx.db as Database;

    /* ── Reuse a fresh assessment rather than charging twice ─────────────── */
    const freshnessCutoff = new Date(Date.now() - params.freshnessDays * 24 * 60 * 60 * 1000);

    const [existing] = await db
      .select({
        id: assessment.id,
        status: assessment.status,
        startedAt: assessment.startedAt,
      })
      .from(assessment)
      .where(
        and(
          eq(assessment.websiteCandidateId, params.websiteCandidateId),
          gt(assessment.startedAt, freshnessCutoff),
        ),
      )
      .orderBy(desc(assessment.startedAt))
      .limit(1);

    if (existing) {
      const findingCount = await db.$count(finding, eq(finding.assessmentId, existing.id));

      await recordCacheHit(db, {
        workspaceId: ctx.workspaceId,
        unitType: 'deep_assessment',
        idempotencyKey: `${ctx.jobId}:reuse`,
        runId: ctx.runId,
        jobId: ctx.jobId,
        reusedFrom: existing.startedAt,
      });

      return ok({
        assessmentId: existing.id,
        outcome: existing.status,
        findingCount,
        captureCount: 0,
        reused: true,
      });
    }

    /* ── Inspect for real ─────────────────────────────────────────────────── */
    const started = Date.now();
    const result = await inspectWebsite(params.url);

    await ctx.recordProviderCall({
      provider: 'chromium',
      capabilityId: 'website_inspection',
      latencyMs: Date.now() - started,
      httpStatus: result.status ?? undefined,
      costUnits: 1,
    });

    const findings = deriveFindings(result);

    const [created] = await db
      .insert(assessment)
      .values({
        websiteCandidateId: params.websiteCandidateId,
        // Null: an assessment of a public website is a public fact, shared
        // between workspaces. That sharing is what makes reuse possible.
        workspaceId: null,
        status: result.outcome,
        inconclusiveReason:
          result.outcome === 'inconclusive_blocked'
            ? 'blocked'
            : result.outcome === 'inconclusive_timeout'
              ? 'timeout'
              : null,
        blockedDetail: result.inconclusiveDetail ?? null,
        rulesetVersion: RULESET_VERSION,
        engineVersion: ENGINE_VERSION,
        pagesVisited: result.pages.length,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
      })
      .returning({ id: assessment.id });

    const assessmentId = created?.id;
    if (!assessmentId) {
      return { kind: 'failed', reason: 'Could not record the assessment.' };
    }

    /* Findings. Empty for every inconclusive outcome — `deriveFindings`
       guarantees it, and this loop simply never runs in that case. */
    if (findings.length > 0) {
      await db.insert(finding).values(
        findings.map((item) => ({
          assessmentId,
          ruleKey: item.ruleKey,
          classification: item.classification,
          severity: item.severity,
          summary: item.summary,
          detail: item.detail,
          observedUrl: item.observedUrl,
        })),
      );
    }

    /* Captures. A capture that fails to store costs an image, not the run. */
    const store = getBlobStore();
    let captureCount = 0;

    for (const [index, shot] of result.captures.entries()) {
      try {
        const key = captureKey(assessmentId, shot.viewport, index);
        const stored = await store.put(key, shot.png, 'image/png');

        await db.insert(blobObject).values({
          workspaceId: null,
          backend: 'fs',
          key: stored.ref,
          contentType: stored.contentType,
          bytes: stored.bytes,
          sha256: stored.sha256,
        });

        await db.insert(capture).values({
          assessmentId,
          kind: 'screenshot',
          viewport: shot.viewport,
          url: shot.url,
          blobRef: stored.ref,
          width: shot.width,
          height: shot.height,
          bytes: stored.bytes,
        });

        captureCount += 1;
      } catch {
        // Deliberately swallowed: a missing screenshot does not invalidate the
        // observations, and failing the assessment over one would be worse.
      }
    }

    /* Record what we now know about the site's reachability. */
    if (result.outcome === 'inconclusive_blocked') {
      await db
        .update(websiteCandidate)
        .set({ identityStatus: 'inaccessible', decidedAt: new Date() })
        .where(eq(websiteCandidate.id, params.websiteCandidateId));
    }

    const payload: Output = {
      assessmentId,
      outcome: result.outcome,
      findingCount: findings.length,
      captureCount,
      reused: false,
    };

    if (result.outcome === 'inconclusive_blocked') {
      return inconclusive(
        'blocked',
        result.inconclusiveDetail ?? 'The site refused an automated reader.',
      );
    }

    if (result.outcome === 'inconclusive_timeout') {
      return inconclusive('timeout', result.inconclusiveDetail ?? 'The site did not respond in time.');
    }

    if (result.outcome === 'failed') {
      return { kind: 'failed', reason: result.inconclusiveDetail ?? 'Inspection failed.' };
    }

    return ok(payload);
  },
});
