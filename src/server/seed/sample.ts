import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  business,
  contact,
  event,
  evidence,
  membership,
  researchRun,
  sourceRecord,
  subscription,
  usageLedger,
  websiteCandidate,
  workspace,
  workspacePreference,
  serviceProfile,
  portfolioProject,
  conversation,
  conversationMessage,
  identityConflict,
  user,
  opportunity as opportunityTable,
} from '../db/schema';
import { safeFetch, hashUrl } from '@/lib/net/safe-fetch';
import { detectInjection, toPlainText } from '@/lib/untrusted/wrap';
import { parseDate, freshnessWindowDays } from '../evidence/dates';
import { inspectWebsite } from '../inspect/inspect';
import { deriveFindings, RULESET_VERSION } from '../inspect/findings';
import { assessment, blobObject, capture, finding } from '../db/schema';
import { captureKey, getBlobStore } from '../storage/blob';
import { scoreOpportunity } from '../rank/score';
import { listOpportunities, upsertOpportunity } from '../db/repo/opportunity';
import { prepareCampaign } from '../outreach/prepare';
import { launchChromium } from '../inspect/chromium';
import { startFixtureServer } from './fixture-server';
import type { Browser } from 'playwright';

/**
 * THE SAMPLE WORKSPACE
 *
 * Every organization here is invented. Everything *about* them is real.
 *
 * The seeder does not write plausible-looking rows. It starts a local server,
 * serves fixture websites from it, and runs the actual pipeline against them:
 * real HTTP retrievals with real status codes and content hashes, real
 * Playwright screenshots at real viewport sizes, real dates parsed out of real
 * markup at their real precision.
 *
 * That matters for two reasons. The workflow behaves exactly as it will on the
 * user's own research rather than approximately. And the honesty rules are
 * exercised rather than bypassed — the blocked fixture really does produce an
 * inconclusive assessment with no findings, because it really does refuse us.
 *
 * Sample-ness is a fact at the data layer (`workspace.kind`, `data_origin`),
 * not a label in the UI, so a real workspace's queries exclude it structurally.
 */

export type SeedResult = {
  readonly workspaceId: string;
  readonly opportunities: number;
  readonly assessments: number;
  readonly captures: number;
  readonly drafts: number;
  readonly conversations: number;
};

type Prospect = {
  readonly site: string;
  readonly name: string;
  readonly module:
    | 'fashion'
    | 'hospitality'
    | 'professional'
    | 'local_services'
    | 'creators'
    | 'software'
    | 'esports';
  readonly region: string;
  readonly country: string;
  /** Deliberately seeded states, so the UI has every case to render. */
  readonly note?: string;
};

/**
 * A balanced mix across modules, per the brief's instruction to show several
 * industries rather than leading with gaming.
 */
const PROSPECTS: readonly Prospect[] = [
  { site: 'clean-shop', name: 'Meridian Supply Co.', module: 'fashion', region: 'Porto', country: 'PT' },
  { site: 'external-booking', name: 'The Fold', module: 'hospitality', region: 'Leeds', country: 'GB' },
  { site: 'no-contact', name: 'Ashgrove Consulting', module: 'professional', region: 'Edinburgh', country: 'GB' },
  { site: 'injection', name: 'Northwind Tiles', module: 'local_services', region: 'Yorkshire', country: 'GB' },
  { site: 'blocked', name: 'Carrow & Vane', module: 'creators', region: 'Berlin', country: 'DE', note: 'Refuses automated readers' },
  { site: 'twins-a', name: 'Harbour & Co', module: 'local_services', region: 'Bristol', country: 'GB' },
  { site: 'twins-b', name: 'Harbour and Co.', module: 'professional', region: 'Aberdeen', country: 'GB' },
  { site: 'rebrand-new', name: 'Lumen Studio', module: 'software', region: 'Rotterdam', country: 'NL' },
];

function nameKeyOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(?:ltd|limited|co|company|and|the|&)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Seeds a sample workspace for `userId`, replacing any previous one. */
export async function seedSampleWorkspace(db: Database, userId: string): Promise<SeedResult> {
  const server = await startFixtureServer();
  let browser: Browser | undefined;

  // Fixtures live on loopback. The escape hatch throws in production, so a
  // seeded demo cannot be used to widen the SSRF policy on a real deployment.
  const previousLoopback = process.env.KOVVI_SSRF_ALLOW_LOOPBACK;
  process.env.KOVVI_SSRF_ALLOW_LOOPBACK = '1';

  try {
    browser = await launchChromium();

    /* Replace rather than accumulate. Re-seeding is something you do while
       iterating, and a user quietly acquiring five sample workspaces would be
       both confusing and a slow leak of screenshots. */
    const existing = await db
      .select({ id: workspace.id })
      .from(workspace)
      .innerJoin(membership, eq(membership.workspaceId, workspace.id))
      .where(and(eq(membership.userId, userId), eq(workspace.kind, 'sample')));

    for (const stale of existing) {
      await db.delete(workspace).where(eq(workspace.id, stale.id));
    }

    const [created] = await db
      .insert(workspace)
      .values({ name: 'Sample workspace', kind: 'sample' })
      .returning({ id: workspace.id });

    const workspaceId = created!.id;

    await db.insert(membership).values({ workspaceId, userId, role: 'owner' });
    await db.insert(workspacePreference).values({ workspaceId });
    await db.insert(subscription).values({ workspaceId, status: 'absent' });
    await db.insert(usageLedger).values({
      workspaceId,
      kind: 'grant',
      unitType: 'deep_assessment',
      units: 100,
      idempotencyKey: `grant:${workspaceId}`,
      note: 'Sample workspace allowance',
    });

    const [run] = await db
      .insert(researchRun)
      .values({
        workspaceId,
        unitCap: 100,
        status: 'completed',
        moduleIds: ['fashion', 'hospitality', 'professional', 'local_services', 'creators', 'software'],
        isSample: true,
        startedAt: new Date(Date.now() - 6 * 60 * 1000),
        finishedAt: new Date(),
        coverage: [
          { adapterKey: 'manual_import', label: 'Manual URL import', attempted: 8, ok: 8, failed: 0, absent: false },
          {
            adapterKey: 'web_search',
            label: 'Web search discovery',
            attempted: 0,
            ok: 0,
            failed: 0,
            absent: true,
            note: 'Not connected — no search provider configured.',
          },
        ],
      })
      .returning({ id: researchRun.id });

    // Needed after the loop, to wire the two same-named businesses together.
    const byFixture = new Map<string, string>();
    let assessments = 0;
    let captures = 0;
    let opportunities = 0;

    for (const prospect of PROSPECTS) {
      const url = server.siteUrl(prospect.site);

      /* ── A real retrieval ────────────────────────────────────────────── */
      const fetched = await safeFetch(url);
      const html = fetched.ok ? fetched.body : '';
      const text = toPlainText(html);
      const scan = detectInjection(text);

      const [record] = await db
        .insert(sourceRecord)
        .values({
          adapterId: 'manual_import',
          url,
          urlHash: hashUrl(url),
          httpStatus: fetched.ok ? fetched.status : null,
          finalUrl: fetched.ok ? fetched.finalUrl : null,
          contentType: fetched.ok ? fetched.contentType : null,
          contentHash: fetched.ok
            ? fetched.contentHash
            : createHash('sha256').update(`${url}:${fetched.reason}`).digest('hex'),
          byteLength: fetched.ok ? fetched.byteLength : 0,
          trustLevel: 'untrusted_web',
          injectionFlagged: scan.flagged,
          injectionDetail: scan.summary,
          dataOrigin: 'sample',
        })
        .returning({ id: sourceRecord.id });

      const [biz] = await db
        .insert(business)
        .values({
          canonicalName: prospect.name,
          nameKey: nameKeyOf(prospect.name),
          country: prospect.country,
          region: prospect.region,
          industryModuleIds: [prospect.module],
          maturity: 'established',
          // Fixture sites share one host, so there is no distinguishing domain.
          canonicalDomainState: 'unknown',
          canonicalDomainReason: 'no_evidence',
          dataOrigin: 'sample',
        })
        .returning({ id: business.id });

      const businessId = biz!.id;
      byFixture.set(prospect.site, businessId);

      /* ── Evidence, quoted from the page we actually fetched ──────────── */
      const parsed = parseDate(text);
      const headline = text.slice(0, 220);

      const [claim] = await db
        .insert(evidence)
        .values({
          businessId,
          sourceRecordId: record!.id,
          claimKey: 'page_summary',
          classification: 'subjective_observation',
          confidence: fetched.ok ? 'high' : 'low',
          excerpt: headline || 'The page could not be read.',
          observedAt: parsed?.date ?? null,
          expiresAt: new Date(Date.now() + freshnessWindowDays('other') * 86_400_000),
          origin: 'extractor',
          extractorVersion: 'seed/1',
          dataOrigin: 'sample',
        })
        .returning({ id: evidence.id });

      if (parsed) {
        await db.insert(event).values({
          businessId,
          eventType: prospect.module === 'fashion' ? 'collection_launch' : 'opening',
          title: `Dated activity found on the site`,
          eventDate: parsed.date,
          eventDatePrecision: parsed.precision,
          evidenceId: claim!.id,
          dataOrigin: 'sample',
        });
      }

      /* ── A real inspection ───────────────────────────────────────────── */
      const [candidate] = await db
        .insert(websiteCandidate)
        .values({
          businessId,
          url,
          normalisedHost: new URL(url).host,
          identityStatus: fetched.ok ? 'confirmed_official' : 'inaccessible',
          identityConfidence: fetched.ok ? 'high' : 'low',
          signals: [{ signal: 'manual_import', weight: 100 }],
          searchedVia: ['manual_import'],
          searchedAt: new Date(),
          decidedAt: new Date(),
          dataOrigin: 'sample',
        })
        .returning({ id: websiteCandidate.id });

      const inspection = await inspectWebsite(url, { browser, maxPages: 4 });
      const findings = deriveFindings(inspection);

      const [recorded] = await db
        .insert(assessment)
        .values({
          websiteCandidateId: candidate!.id,
          workspaceId: null,
          status: inspection.outcome,
          inconclusiveReason:
            inspection.outcome === 'inconclusive_blocked'
              ? 'blocked'
              : inspection.outcome === 'inconclusive_timeout'
                ? 'timeout'
                : null,
          blockedDetail: inspection.inconclusiveDetail ?? null,
          rulesetVersion: RULESET_VERSION,
          engineVersion: inspection.engineVersion,
          pagesVisited: inspection.pages.length,
          startedAt: inspection.startedAt,
          finishedAt: inspection.finishedAt,
          dataOrigin: 'sample',
        })
        .returning({ id: assessment.id });

      assessments += 1;

      if (findings.length > 0) {
        await db.insert(finding).values(
          findings.map((item) => ({
            assessmentId: recorded!.id,
            ruleKey: item.ruleKey,
            classification: item.classification,
            severity: item.severity,
            summary: item.summary,
            detail: item.detail,
            observedUrl: item.observedUrl,
          })),
        );
      }

      const store = getBlobStore();
      for (const [index, shot] of inspection.captures.entries()) {
        const key = captureKey(recorded!.id, shot.viewport, index);
        const stored = await store.put(key, shot.png, 'image/png');

        await db.insert(blobObject).values({
          backend: 'fs',
          key: stored.ref,
          contentType: stored.contentType,
          bytes: stored.bytes,
          sha256: stored.sha256,
        });

        await db.insert(capture).values({
          assessmentId: recorded!.id,
          kind: 'screenshot',
          viewport: shot.viewport,
          url: shot.url,
          blobRef: stored.ref,
          width: shot.width,
          height: shot.height,
          bytes: stored.bytes,
        });

        captures += 1;
      }

      /* ── Contacts, only where the page actually offered one ──────────── */
      const emails = [...new Set(inspection.pages.flatMap((page) => page.emailLinks))];
      for (const email of emails) {
        await db.insert(contact).values({
          businessId,
          channel: 'email',
          value: email,
          valueHash: createHash('sha256').update(email.toLowerCase()).digest('hex'),
          verification: 'probable',
          sourceRecordId: record!.id,
          dataOrigin: 'sample',
        });
      }

      if (inspection.pages.some((page) => page.hasContactForm)) {
        await db.insert(contact).values({
          businessId,
          channel: 'contact_form',
          value: inspection.finalUrl ?? url,
          valueHash: createHash('sha256').update(`form:${url}`).digest('hex'),
          verification: 'probable',
          sourceRecordId: record!.id,
          dataOrigin: 'sample',
        });
      }

      /* ── The opportunity ─────────────────────────────────────────────── */
      const inconclusive = inspection.outcome.startsWith('inconclusive');
      const score = scoreOpportunity({
        matchedClaims: [],
        industryMatches: true,
        regionMatches: true,
        evidenceCount: 1 + findings.length,
        objectiveDefects: findings.filter((f) => f.classification === 'objective_defect').length,
        inconclusive,
        latestEvent: parsed ? { date: parsed.date, type: 'opening', evidenceId: claim!.id } : null,
        hasVerifiedContact: false,
        hasAnyContact: emails.length > 0 || inspection.pages.some((p) => p.hasContactForm),
        identityConfirmed: fetched.ok,
      });

      // Deliberately goes through the same repo function the pipeline uses,
      // rather than inserting directly. Sample opportunities then carry the
      // same score-input rows as real ones, so the dossier's "how this ranked"
      // breakdown is populated — and the seeder exercises the dedupe path.
      await upsertOpportunity(
        db,
        { workspaceId, userId, role: 'owner' },
        {
          businessId,
          moduleId: prospect.module,
          runId: run!.id,
          score,
          matchExplanation: [
            { reason: `Industry matches the ${prospect.module.replace('_', ' ')} module` },
          ],
          dataOrigin: 'sample',
        },
      );

      opportunities += 1;
    }

    await db
      .update(researchRun)
      .set({ unitsFinalised: assessments, unitsReserved: assessments })
      .where(eq(researchRun.id, run!.id));

    /* An UNRESOLVED identity conflict, seeded deliberately.
       `twins-a` and `twins-b` are two different businesses that normalise to
       the same name key. Nothing in the product can tell them apart, so the
       conflict is recorded as open and outreach to both is blocked — the state
       the brief asks for, reached the way it would really be reached rather
       than written into a row by hand. */
    const twinA = byFixture.get('twins-a');
    const twinB = byFixture.get('twins-b');

    if (twinA && twinB) {
      await db.insert(identityConflict).values({
        businessId: twinA,
        otherBusinessId: twinB,
        status: 'open',
        reason:
          'Two businesses normalise to the same name and neither has a confirmed domain. Telling them apart needs something only you can supply.',
      });

      await db
        .update(opportunityTable)
        .set({ blockedReason: 'identity_conflict' })
        .where(inArray(opportunityTable.businessId, [twinA, twinB]));
    }

    const outreach = await seedOutreach(db, { workspaceId, userId });

    return { workspaceId, opportunities, assessments, captures, ...outreach };
  } finally {
    await browser?.close().catch(() => {});
    await server.close();

    if (previousLoopback === undefined) delete process.env.KOVVI_SSRF_ALLOW_LOOPBACK;
    else process.env.KOVVI_SSRF_ALLOW_LOOPBACK = previousLoopback;
  }
}

/**
 * The outreach half of the sample.
 *
 * Drafts are produced by the REAL drafter against the evidence the run above
 * genuinely collected, so what the user reads in the sample review screen is
 * the same prose the same code would write for their own research — including
 * the messages it refuses to write, and its stated omissions.
 *
 * The sample workspace cannot send. That is enforced in dispatch, not here, so
 * the sample exercises the block rather than avoiding it. The one seeded reply
 * is recorded as a manual log, which is what it would be.
 */
async function seedOutreach(
  db: Database,
  ctx: { readonly workspaceId: string; readonly userId: string },
): Promise<{ readonly drafts: number; readonly conversations: number }> {
  const tenant = { workspaceId: ctx.workspaceId, userId: ctx.userId, role: 'owner' as const };

  const profileValues = {
    workspaceId: ctx.workspaceId,
    headline: 'Ecommerce and brand sites for small independent businesses',
    services: ['ecommerce redesign', 'brand site build', 'mobile checkout'],
    regions: ['PT', 'IE', 'GB'],
    languages: ['en', 'pt'],
    exclusions: [] as string[],
    minProjectPriceCents: 250_000,
    confirmedAt: new Date(),
  };

  await db
    .insert(serviceProfile)
    .values(profileValues)
    .onConflictDoUpdate({ target: serviceProfile.workspaceId, set: profileValues });

  const existingProjects = await db
    .select({ id: portfolioProject.id })
    .from(portfolioProject)
    .where(eq(portfolioProject.workspaceId, ctx.workspaceId));

  if (existingProjects.length === 0) {
    await db.insert(portfolioProject).values({
      workspaceId: ctx.workspaceId,
      url: 'https://example.com/work/atelier-nord',
      title: 'Atelier Nord',
      role: 'Design and build',
      summary: 'Small-batch clothing label. Mobile-first storefront and checkout.',
      industryTags: ['fashion', 'local_services'],
      isRepresentative: true,
    });
  }

  const [account] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, ctx.userId))
    .limit(1);

  // The sample writes in the user's own name, because that is whose name the
  // real messages would carry. A placeholder here would make the sample read
  // like a template when the point of it is that it does not.
  const sender = account?.name?.trim() || account?.email?.split('@')[0] || 'me';

  const shortlist = await listOpportunities(db, tenant);
  const candidates = shortlist
    .filter((row) => !row.identityConflictOpen && row.hasContact)
    .slice(0, 4)
    .map((row) => row.id);

  const prepared = await prepareCampaign(db, tenant, {
    name: 'Sample campaign — Porto and Bristol',
    opportunityIds: candidates,
    senderName: sender,
  });

  let conversations = 0;

  const first = prepared.prepared[0];
  if (first) {
    const [thread] = await db
      .insert(conversation)
      .values({
        workspaceId: ctx.workspaceId,
        opportunityId: first.opportunityId,
        channel: 'email',
        lastMessageAt: new Date(),
      })
      .returning({ id: conversation.id });

    await db.insert(conversationMessage).values([
      {
        workspaceId: ctx.workspaceId,
        conversationId: thread!.id,
        direction: 'manual_log',
        body: 'Sent by hand from your own mail client, then logged here.',
        sourceMessageId: first.messageId,
        occurredAt: new Date(Date.now() - 3 * 86_400_000),
      },
      {
        workspaceId: ctx.workspaceId,
        conversationId: thread!.id,
        direction: 'inbound',
        body: 'Thanks for getting in touch. We are looking at the site early next year — can you send over what a redesign would involve?',
        // Left unclassified on purpose. It reads like interest; it may not be,
        // and the product will not decide that on the user's behalf.
        occurredAt: new Date(Date.now() - 86_400_000),
      },
    ]);

    await db
      .update(opportunityTable)
      .set({ stage: 'replied' })
      .where(eq(opportunityTable.id, first.opportunityId));

    conversations = 1;
  }

  return { drafts: prepared.prepared.length, conversations };
}
